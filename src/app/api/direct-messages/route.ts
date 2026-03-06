import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DirectMessageContext } from "@prisma/client";
import {
    ensureDirectMessageCapacity,
    withDirectMessageGoodTable,
    withDirectMessageTable,
} from "@/lib/directMessages";
import { resolveSessionUserId } from "@/lib/sessionUser";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
const DEFAULT_DM_SETTING: DmSetting = "OPEN";

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
            withDirectMessageGoodTable(() =>
                prisma.directMessageGood.groupBy({
                    by: ["messageId"],
                    where: { messageId: { in: messageIds } },
                    _count: { _all: true },
                })
            ),
            currentUserId
                ? withDirectMessageGoodTable(() =>
                      prisma.directMessageGood.findMany({
                          where: {
                              messageId: { in: messageIds },
                              userId: currentUserId,
                          },
                          select: { messageId: true },
                      })
                  )
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
    const session = await auth(req as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    const userId = await resolveSessionUserId(session as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
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
        if (mode === "thread") {
            if (!targetUserId) {
                return NextResponse.json({ error: "userId is required for thread mode" }, { status: 400 });
            }

            const resolvedTargetUserId = await resolveUserPrimaryId(targetUserId);
            if (!resolvedTargetUserId) {
                return NextResponse.json({ error: "Target user not found" }, { status: 404 });
            }

            const messages = await withDirectMessageTable(() =>
                prisma.directMessage.findMany({
                    where: {
                        OR: [
                            { senderId: userId, recipientId: resolvedTargetUserId },
                            { senderId: resolvedTargetUserId, recipientId: userId },
                        ],
                    },
                    orderBy: { createdAt: "asc" },
                    include: {
                        sender: { select: { id: true, name: true, email: true, image: true } },
                        recipient: { select: { id: true, name: true, email: true, image: true } },
                    },
                })
            );

            return NextResponse.json({
                mode,
                userId: resolvedTargetUserId,
                messages: await appendDirectMessageGoodState(messages, userId),
            });
        }

        if (mode === "threads") {
            const messages = await withDirectMessageTable(() =>
                prisma.directMessage.findMany({
                    where: {
                        OR: [{ senderId: userId }, { recipientId: userId }],
                    },
                    orderBy: { createdAt: "desc" },
                    include: {
                        sender: { select: { id: true, name: true, email: true, image: true } },
                        recipient: { select: { id: true, name: true, email: true, image: true } },
                    },
                })
            );

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
                    };
                }
            >();

            for (const message of messages) {
                const otherUser = message.senderId === userId ? message.recipient : message.sender;
                if (!otherUser || threadMap.has(otherUser.id)) continue;
                threadMap.set(otherUser.id, {
                    id: otherUser.id,
                    user: otherUser,
                    lastMessage: {
                        id: message.id,
                        content: message.content,
                        createdAt: message.createdAt,
                        senderId: message.senderId,
                        recipientId: message.recipientId,
                    },
                });
            }

            return NextResponse.json({ mode, threads: Array.from(threadMap.values()) });
        }

        if (mode === "sent") {
            const messages = await withDirectMessageTable(() =>
                prisma.directMessage.findMany({
                    where: {
                        senderId: userId,
                        context: DirectMessageContext.GENERAL,
                    },
                    orderBy: { createdAt: "desc" },
                    include: {
                        recipient: { select: { id: true, name: true, email: true, image: true } },
                    },
                })
            );
            return NextResponse.json({ mode, messages });
        }

        const messages = await withDirectMessageTable(() =>
            prisma.directMessage.findMany({
                where: {
                    recipientId: userId,
                    context: DirectMessageContext.GENERAL,
                },
                orderBy: { createdAt: "desc" },
                include: {
                    sender: { select: { id: true, name: true, email: true, image: true } },
                },
            })
        );

        return NextResponse.json({ mode, messages });
    } catch (error) {
        console.error("Failed to fetch direct messages:", error);
        if (mode === "threads") {
            return NextResponse.json({ mode, threads: [] });
        }
        if (mode === "thread") {
            return NextResponse.json({ mode, userId: targetUserId, messages: [] });
        }
        if (mode === "sent" || mode === "inbox") {
            return NextResponse.json({ mode, messages: [] });
        }
        return NextResponse.json({ error: "Failed to fetch direct messages" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await auth(req as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    const userId = await resolveSessionUserId(session as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
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

        const recipientDmSetting = unpackDmSettingFromLinks(recipient.links);
        if (recipientDmSetting !== "OPEN") {
            return NextResponse.json(
                { error: "This user is not accepting general direct messages." },
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
                    sender: { select: { id: true, name: true, email: true, image: true } },
                    recipient: { select: { id: true, name: true, email: true, image: true } },
                },
            })
        );

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
