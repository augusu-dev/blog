import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DirectMessageContext, PullRequestStatus } from "@prisma/client";
import {
    ensureDirectMessageCapacity,
    withDirectMessageTable,
} from "@/lib/directMessages";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { invalidateReadCachePrefix, readCacheKeys, readThroughCache } from "@/lib/readCache";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
const DEFAULT_DM_SETTING: DmSetting = "OPEN";
const DIRECT_MESSAGES_CACHE_TTL_MS = 5 * 1000;
const DM_USER_SELECT = {
    id: true,
    userId: true,
    name: true,
    email: true,
    image: true,
} as const;
const DM_PULL_REQUEST_SELECT = {
    id: true,
    kind: true,
    title: true,
    excerpt: true,
    content: true,
    status: true,
    publicationExpiresAt: true,
    postId: true,
    tags: true,
    proposerId: true,
    recipientId: true,
} as const;
const LEGACY_DM_PULL_REQUEST_SELECT = {
    id: true,
    title: true,
    excerpt: true,
    content: true,
    status: true,
    tags: true,
    proposerId: true,
    recipientId: true,
} as const;

type DmSerializedPullRequest = {
    id: string;
    kind: "SUBMISSION" | "EXTENSION";
    title: string;
    excerpt: string | null;
    content: string;
    status: "PENDING" | "ON_HOLD" | "ACCEPTED" | "REJECTED";
    publicationExpiresAt: string | null;
    postId: string | null;
    tags: string[];
    proposerId: string;
    recipientId: string;
};

function hasDmPayloadContent(value: unknown): boolean {
    if (!value || typeof value !== "object") {
        return false;
    }

    const payload = value as {
        threads?: unknown;
        messages?: unknown;
        user?: unknown;
    };

    return (
        (Array.isArray(payload.threads) && payload.threads.length > 0) ||
        (Array.isArray(payload.messages) && payload.messages.length > 0) ||
        !!payload.user
    );
}

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function parseDmSetting(value: unknown): DmSetting | undefined {
    if (value === "OPEN" || value === "PR_ONLY" || value === "CLOSED") {
        return value;
    }
    return undefined;
}

function unpackDmSettingFromLinks(raw: string | null | undefined): DmSetting {
    if (!raw) return DEFAULT_DM_SETTING;

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const candidate = parsed as { dmSetting?: unknown };
            return parseDmSetting(candidate.dmSetting) || DEFAULT_DM_SETTING;
        }
    } catch {
        return DEFAULT_DM_SETTING;
    }

    return DEFAULT_DM_SETTING;
}

function buildThreadPreview(message: {
    context: DirectMessageContext;
    content: string;
    pullRequest?: { title: string; kind?: "SUBMISSION" | "EXTENSION" | null } | null;
}) {
    if (message.context === DirectMessageContext.PULL_REQUEST) {
        if (message.pullRequest?.title) {
            return message.pullRequest.kind === "EXTENSION"
                ? `Extension: ${message.pullRequest.title}`
                : `PR: ${message.pullRequest.title}`;
        }
        return "Article pull request";
    }

    return message.content;
}

function serializePullRequest<T extends { publicationExpiresAt: Date | null } | null | undefined>(pullRequest: T) {
    if (!pullRequest) {
        return null;
    }

    return {
        ...pullRequest,
        publicationExpiresAt: pullRequest.publicationExpiresAt ? pullRequest.publicationExpiresAt.toISOString() : null,
    };
}

function hydrateLegacyPullRequest<T extends Record<string, unknown>>(pullRequest: T | null | undefined) {
    if (!pullRequest) {
        return null;
    }

    return {
        ...pullRequest,
        kind: "SUBMISSION" as const,
        publicationExpiresAt: null,
        postId: null,
    };
}

function normalizePullRequestStatus(value: unknown): DmSerializedPullRequest["status"] {
    if (
        value === PullRequestStatus.ON_HOLD ||
        value === PullRequestStatus.ACCEPTED ||
        value === PullRequestStatus.REJECTED
    ) {
        return value;
    }

    return PullRequestStatus.PENDING;
}

function normalizeDirectMessagePullRequest(pullRequest: unknown): DmSerializedPullRequest | null {
    if (!pullRequest || typeof pullRequest !== "object") {
        return null;
    }

    const candidate = pullRequest as {
        id?: unknown;
        kind?: unknown;
        title?: unknown;
        excerpt?: unknown;
        content?: unknown;
        status?: unknown;
        publicationExpiresAt?: unknown;
        postId?: unknown;
        tags?: unknown;
        proposerId?: unknown;
        recipientId?: unknown;
    };

    return {
        id: normalizeString(candidate.id),
        kind: candidate.kind === "EXTENSION" ? "EXTENSION" : "SUBMISSION",
        title: normalizeString(candidate.title),
        excerpt: typeof candidate.excerpt === "string" ? candidate.excerpt : null,
        content: typeof candidate.content === "string" ? candidate.content : "",
        status: normalizePullRequestStatus(candidate.status),
        publicationExpiresAt:
            candidate.publicationExpiresAt instanceof Date
                ? candidate.publicationExpiresAt.toISOString()
                : typeof candidate.publicationExpiresAt === "string"
                  ? candidate.publicationExpiresAt
                  : null,
        postId: typeof candidate.postId === "string" ? candidate.postId : null,
        tags: Array.isArray(candidate.tags)
            ? candidate.tags.filter((tag): tag is string => typeof tag === "string")
            : [],
        proposerId: normalizeString(candidate.proposerId),
        recipientId: normalizeString(candidate.recipientId),
    };
}

function isDirectMessageReadUnavailableError(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
        const code = String((error as { code?: unknown }).code || "");
        if (code === "P2021" || code === "P2022") {
            return true;
        }
    }

    if (error instanceof Error) {
        return /DirectMessage|DirectMessageGood|relation .* does not exist|column .* does not exist|permission denied|must be owner/i.test(
            error.message
        );
    }

    return false;
}

async function hasOnHoldPullRequestBetweenUsers(userAId: string, userBId: string): Promise<boolean> {
    try {
        const match = await prisma.articlePullRequest.findFirst({
            where: {
                status: PullRequestStatus.ON_HOLD,
                OR: [
                    { proposerId: userAId, recipientId: userBId },
                    { proposerId: userBId, recipientId: userAId },
                ],
            },
            select: { id: true },
        });

        return !!match;
    } catch {
        return false;
    }
}

async function getGeneralMessagePermission(senderId: string, recipientId: string) {
    const recipient = await prisma.user.findUnique({
        where: { id: recipientId },
        select: { id: true, links: true },
    });

    if (!recipient) {
        return {
            allowed: false,
            note: "このユーザーは見つかりませんでした。",
        };
    }

    const recipientDmSetting = unpackDmSettingFromLinks(recipient.links);

    if (recipientDmSetting === "OPEN") {
        return {
            allowed: true,
            note: "",
        };
    }

    if (recipientDmSetting === "CLOSED") {
        return {
            allowed: false,
            note: "このユーザーは現在DMを受け付けていません。",
        };
    }

    const allowedByOnHoldPullRequest = await hasOnHoldPullRequestBetweenUsers(senderId, recipientId);
    if (allowedByOnHoldPullRequest) {
        return {
            allowed: true,
            note: "保留中のプルリクエストがあるため、一時的にDMが可能です。",
        };
    }

    return {
        allowed: false,
        note: "このユーザーは「プルリクエスト時のみ」です。保留中のプルリクエストがある間だけDMできます。",
    };
}

async function getDirectMessageGoodState(messageIds: string[], currentUserId: string | null) {
    const empty = new Map<string, { goodCount: number; likedByMe: boolean }>();
    if (messageIds.length === 0) {
        return empty;
    }

    for (const messageId of messageIds) {
        empty.set(messageId, { goodCount: 0, likedByMe: false });
    }

    try {
        const [counts, mine] = await Promise.all([
            prisma.directMessageGood
                .groupBy({
                    by: ["messageId"],
                    where: { messageId: { in: messageIds } },
                    _count: { _all: true },
                })
                .catch((error) => {
                    if (isDirectMessageReadUnavailableError(error)) {
                        return [] as Array<{ messageId: string; _count: { _all: number } }>;
                    }
                    throw error;
                }),
            currentUserId
                ? prisma.directMessageGood
                      .findMany({
                          where: {
                              messageId: { in: messageIds },
                              userId: currentUserId,
                          },
                          select: { messageId: true },
                      })
                      .catch((error) => {
                          if (isDirectMessageReadUnavailableError(error)) {
                              return [] as Array<{ messageId: string }>;
                          }
                          throw error;
                      })
                : Promise.resolve([] as Array<{ messageId: string }>),
        ]);

        for (const row of counts) {
            empty.set(row.messageId, {
                goodCount: row._count._all,
                likedByMe: empty.get(row.messageId)?.likedByMe ?? false,
            });
        }

        for (const row of mine) {
            empty.set(row.messageId, {
                goodCount: empty.get(row.messageId)?.goodCount ?? 0,
                likedByMe: true,
            });
        }
    } catch (error) {
        console.error("Failed to load direct message goods:", error);
    }

    return empty;
}

async function appendDirectMessageGoodState<
    T extends {
        id: string;
    },
>(messages: T[], currentUserId: string | null) {
    const goodState = await getDirectMessageGoodState(
        messages.map((message) => message.id),
        currentUserId
    );

    return messages.map((message) => {
        const state = goodState.get(message.id);
        return {
            ...message,
            goodCount: state?.goodCount ?? 0,
            likedByMe: state?.likedByMe ?? false,
        };
    });
}

async function resolveUserPrimaryId(userRef: string): Promise<string | null> {
    const normalized = normalizeString(userRef);
    if (!normalized) return null;

    let matched = null as { id: string } | null;
    try {
        matched = await prisma.user.findFirst({
            where: {
                OR: [
                    { id: normalized },
                    { userId: normalized.toLowerCase() },
                    { name: { equals: normalized, mode: "insensitive" } },
                ],
            },
            select: { id: true },
        });
    } catch {
        matched = await prisma.user.findFirst({
            where: {
                OR: [{ id: normalized }, { name: { equals: normalized, mode: "insensitive" } }],
            },
            select: { id: true },
        });
    }

    return matched?.id || null;
}

export async function GET(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const modeParam = request.nextUrl.searchParams.get("mode");
    const mode =
        modeParam === "sent"
            ? "sent"
            : modeParam === "thread"
              ? "thread"
              : modeParam === "threads"
                ? "threads"
                : "inbox";
    const targetUserId = normalizeString(request.nextUrl.searchParams.get("userId"));

    try {
        const payload = await readThroughCache(
            readCacheKeys.directMessages(userId, mode, targetUserId),
            DIRECT_MESSAGES_CACHE_TTL_MS,
            async () => {
                if (mode === "thread") {
                    if (!targetUserId) {
                        throw new Error("THREAD_USER_REQUIRED");
                    }

                    const resolvedTargetUserId = await resolveUserPrimaryId(targetUserId);
                    if (!resolvedTargetUserId) {
                        throw new Error("THREAD_TARGET_NOT_FOUND");
                    }

                    let rawMessages;
                    let messages;

                    try {
                        rawMessages = await prisma.directMessage.findMany({
                            where: {
                                OR: [
                                    { senderId: userId, recipientId: resolvedTargetUserId },
                                    { senderId: resolvedTargetUserId, recipientId: userId },
                                ],
                            },
                            orderBy: { createdAt: "asc" },
                            include: {
                                sender: { select: DM_USER_SELECT },
                                recipient: { select: DM_USER_SELECT },
                                pullRequest: { select: DM_PULL_REQUEST_SELECT },
                            },
                        });

                        messages = rawMessages.map((message) => ({
                            ...message,
                            pullRequest: normalizeDirectMessagePullRequest(message.pullRequest),
                        }));
                    } catch (error) {
                        if (!isDirectMessageReadUnavailableError(error)) {
                            throw error;
                        }

                        rawMessages = await prisma.directMessage
                            .findMany({
                                where: {
                                    OR: [
                                        { senderId: userId, recipientId: resolvedTargetUserId },
                                        { senderId: resolvedTargetUserId, recipientId: userId },
                                    ],
                                },
                                orderBy: { createdAt: "asc" },
                                include: {
                                    sender: { select: DM_USER_SELECT },
                                    recipient: { select: DM_USER_SELECT },
                                    pullRequest: { select: LEGACY_DM_PULL_REQUEST_SELECT },
                                },
                            })
                            .catch((legacyError) => {
                                if (isDirectMessageReadUnavailableError(legacyError)) {
                                    return [] as Array<{
                                        id: string;
                                        content: string;
                                        createdAt: Date;
                                        senderId: string;
                                        recipientId: string;
                                        sender: typeof DM_USER_SELECT;
                                        recipient: typeof DM_USER_SELECT;
                                        context: DirectMessageContext;
                                        pullRequest: null;
                                    }>;
                                }
                                throw legacyError;
                            });

                        messages = rawMessages.map((message) => ({
                            ...message,
                            pullRequest: normalizeDirectMessagePullRequest(
                                hydrateLegacyPullRequest(message.pullRequest)
                            ),
                        }));
                    }

                    const targetUser =
                        rawMessages.find((message) => message.senderId === resolvedTargetUserId)?.sender ||
                        rawMessages.find((message) => message.recipientId === resolvedTargetUserId)?.recipient ||
                        (await prisma.user.findUnique({
                            where: { id: resolvedTargetUserId },
                            select: DM_USER_SELECT,
                        }).catch(() => null));
                    const messagePermission = await getGeneralMessagePermission(userId, resolvedTargetUserId);

                    return {
                        mode,
                        userId: resolvedTargetUserId,
                        user: targetUser,
                        canSendMessages: messagePermission.allowed,
                        messagePermissionNote: messagePermission.note,
                        messages: await appendDirectMessageGoodState(messages, userId),
                    };
                }

                if (mode === "threads") {
                    let rawMessages;
                    try {
                        rawMessages = await prisma.directMessage.findMany({
                            where: {
                                OR: [{ senderId: userId }, { recipientId: userId }],
                            },
                            orderBy: { createdAt: "desc" },
                            include: {
                                sender: { select: DM_USER_SELECT },
                                recipient: { select: DM_USER_SELECT },
                                pullRequest: { select: DM_PULL_REQUEST_SELECT },
                            },
                        });
                    } catch (error) {
                        if (!isDirectMessageReadUnavailableError(error)) {
                            throw error;
                        }

                        rawMessages = await prisma.directMessage
                            .findMany({
                                where: {
                                    OR: [{ senderId: userId }, { recipientId: userId }],
                                },
                                orderBy: { createdAt: "desc" },
                                include: {
                                    sender: { select: DM_USER_SELECT },
                                    recipient: { select: DM_USER_SELECT },
                                    pullRequest: { select: LEGACY_DM_PULL_REQUEST_SELECT },
                                },
                            })
                            .catch((legacyError) => {
                                if (isDirectMessageReadUnavailableError(legacyError)) {
                                    return [];
                                }
                                throw legacyError;
                            });
                    }

                    const threadMap = new Map<
                        string,
                        {
                            id: string;
                            user: { id: string; name: string | null; email: string | null; image: string | null };
                            lastMessage: {
                                id: string;
                                content: string;
                                createdAt: Date;
                                senderId: string;
                                recipientId: string;
                                context: DirectMessageContext;
                                pullRequest: {
                                    id: string;
                                    kind: "SUBMISSION" | "EXTENSION";
                                    title: string;
                                    excerpt: string | null;
                                    content: string;
                                    status: "PENDING" | "ON_HOLD" | "ACCEPTED" | "REJECTED";
                                    publicationExpiresAt: string | null;
                                    postId: string | null;
                                    tags: string[];
                                    proposerId: string;
                                    recipientId: string;
                                } | null;
                            };
                        }
                    >();

                    for (const rawMessage of rawMessages) {
                        const pullRequest = normalizeDirectMessagePullRequest(
                            rawMessage.pullRequest && "publicationExpiresAt" in rawMessage.pullRequest
                                ? serializePullRequest(
                                      rawMessage.pullRequest as { publicationExpiresAt: Date | null }
                                  )
                                : hydrateLegacyPullRequest(rawMessage.pullRequest)
                        );
                        const message = {
                            ...rawMessage,
                            pullRequest,
                        };
                        const otherUser = message.senderId === userId ? message.recipient : message.sender;
                        if (!otherUser || threadMap.has(otherUser.id)) continue;
                        threadMap.set(otherUser.id, {
                            id: otherUser.id,
                            user: otherUser,
                            lastMessage: {
                                id: message.id,
                                content: buildThreadPreview({
                                    context: message.context,
                                    content: message.content,
                                    pullRequest: message.pullRequest
                                        ? {
                                              title: message.pullRequest.title,
                                              kind: message.pullRequest.kind,
                                          }
                                        : null,
                                }),
                                createdAt: message.createdAt,
                                senderId: message.senderId,
                                recipientId: message.recipientId,
                                context: message.context,
                                pullRequest: message.pullRequest,
                            },
                        });
                    }

                    return { mode, threads: Array.from(threadMap.values()) };
                }

                if (mode === "sent") {
                    const messages = await prisma.directMessage
                        .findMany({
                            where: {
                                senderId: userId,
                                context: DirectMessageContext.GENERAL,
                            },
                            orderBy: { createdAt: "desc" },
                            include: {
                                recipient: { select: DM_USER_SELECT },
                            },
                        })
                        .catch((error) => {
                            if (isDirectMessageReadUnavailableError(error)) {
                                return [];
                            }
                            throw error;
                        });
                    return { mode, messages };
                }

                const messages = await prisma.directMessage
                    .findMany({
                        where: {
                            recipientId: userId,
                            context: DirectMessageContext.GENERAL,
                        },
                        orderBy: { createdAt: "desc" },
                        include: {
                            sender: { select: DM_USER_SELECT },
                        },
                    })
                    .catch((error) => {
                        if (isDirectMessageReadUnavailableError(error)) {
                            return [];
                        }
                        throw error;
                    });

                return { mode, messages };
            },
            {
                shouldCache: (value) => hasDmPayloadContent(value),
                useStaleOnError: true,
            }
        );

        return NextResponse.json(payload);
    } catch (error) {
        if (error instanceof Error && error.message === "THREAD_USER_REQUIRED") {
            return NextResponse.json({ error: "userId is required for thread mode" }, { status: 400 });
        }
        if (error instanceof Error && error.message === "THREAD_TARGET_NOT_FOUND") {
            return NextResponse.json({ error: "Target user not found" }, { status: 404 });
        }
        console.error("Failed to fetch direct messages:", error);
        return NextResponse.json({ error: "Failed to fetch direct messages" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const recipientRef = normalizeString(body.recipientId);
        const content = normalizeString(body.content);

        if (!recipientRef) {
            return NextResponse.json({ error: "recipientId is required" }, { status: 400 });
        }

        const recipientId = await resolveUserPrimaryId(recipientRef);
        if (!recipientId) {
            return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
        }

        if (recipientId === userId) {
            return NextResponse.json({ error: "Cannot send a message to yourself" }, { status: 400 });
        }

        if (!content || content.length > 10000) {
            return NextResponse.json(
                { error: "Message must be 1-10000 characters." },
                { status: 400 }
            );
        }

        if (content.length > 1000) {
            await ensureDirectMessageCapacity();
        }

        const recipient = await prisma.user.findUnique({
            where: { id: recipientId },
            select: { id: true, links: true },
        });

        if (!recipient) {
            return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
        }

        const messagePermission = await getGeneralMessagePermission(userId, recipientId);
        if (!messagePermission.allowed) {
            return NextResponse.json(
                { error: messagePermission.note || "This user is not accepting general direct messages." },
                { status: 403 }
            );
        }

        const message = await withDirectMessageTable(() =>
            prisma.directMessage.create({
                data: {
                    senderId: userId,
                    recipientId,
                    content,
                    context: DirectMessageContext.GENERAL,
                },
                include: {
                    sender: { select: DM_USER_SELECT },
                    recipient: { select: DM_USER_SELECT },
                },
            })
        );

        invalidateReadCachePrefix("direct-messages:");
        invalidateReadCachePrefix("unread:");

        return NextResponse.json(
            {
                ...message,
                goodCount: 0,
                likedByMe: false,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Failed to send direct message:", error);
        return NextResponse.json({ error: "Failed to send direct message" }, { status: 500 });
    }
}
