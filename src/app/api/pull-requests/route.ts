import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DirectMessageContext, PullRequestStatus } from "@prisma/client";
import { ensureDirectMessageCapacity, ensureDirectMessageSchema } from "@/lib/directMessages";
import { ensurePullRequestSchema, withPullRequestTable } from "@/lib/pullRequests";
import { tryEnsureProfileAndPostSchema } from "@/lib/schemaCompat";
import { ensureUserIdSchema } from "@/lib/userId";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { invalidateReadCachePrefix, normalizeCacheKeyPart, readCacheKeys } from "@/lib/readCache";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
const DEFAULT_DM_SETTING: DmSetting = "OPEN";

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((tag) => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 20);
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

function isMissingSchemaError(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
        const code = String((error as { code?: unknown }).code || "");
        if (code === "P2021" || code === "P2022") return true;
    }

    if (error instanceof Error) {
        return /column .* does not exist|relation .* does not exist/i.test(error.message);
    }

    return false;
}

function invalidatePostAndMessageCaches(userIds: string[]) {
    invalidateReadCachePrefix(readCacheKeys.publicPosts());
    invalidateReadCachePrefix("user-profile:");
    invalidateReadCachePrefix("user-posts:");
    invalidateReadCachePrefix("pins-feed:");

    for (const userId of [...new Set(userIds.map(normalizeCacheKeyPart).filter(Boolean))]) {
        invalidateReadCachePrefix(`unread:${userId}:`);
        invalidateReadCachePrefix(`direct-messages:${userId}:`);
    }
}

const latestPullRequestMessageInclude = {
    where: { context: DirectMessageContext.PULL_REQUEST },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
        id: true,
        content: true,
        createdAt: true,
        sender: { select: { id: true, name: true, email: true } },
    },
};

export async function GET() {
    const session = await auth();
    const userId = await resolveSessionUserId(session as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await ensurePullRequestSchema();
        try {
            await ensureDirectMessageSchema();
        } catch {
            // If the DM schema cannot be ensured, fall back to loading pull requests without message previews.
        }

        const loadWithMessages = () =>
            Promise.all([
                withPullRequestTable(() =>
                    prisma.articlePullRequest.findMany({
                        where: { recipientId: userId },
                        orderBy: { createdAt: "desc" },
                        include: {
                            proposer: {
                                select: { id: true, name: true, email: true },
                            },
                            messages: latestPullRequestMessageInclude,
                        },
                    })
                ),
                withPullRequestTable(() =>
                    prisma.articlePullRequest.findMany({
                        where: { proposerId: userId },
                        orderBy: { createdAt: "desc" },
                        include: {
                            recipient: {
                                select: { id: true, name: true, email: true },
                            },
                            messages: latestPullRequestMessageInclude,
                        },
                    })
                ),
            ]);

        let received;
        let sent;

        try {
            [received, sent] = await loadWithMessages();
        } catch (error) {
            if (!isMissingSchemaError(error)) {
                throw error;
            }

            [received, sent] = await Promise.all([
                withPullRequestTable(() =>
                    prisma.articlePullRequest.findMany({
                        where: { recipientId: userId },
                        orderBy: { createdAt: "desc" },
                        include: {
                            proposer: {
                                select: { id: true, name: true, email: true },
                            },
                        },
                    })
                ),
                withPullRequestTable(() =>
                    prisma.articlePullRequest.findMany({
                        where: { proposerId: userId },
                        orderBy: { createdAt: "desc" },
                        include: {
                            recipient: {
                                select: { id: true, name: true, email: true },
                            },
                        },
                    })
                ),
            ]);
        }

        return NextResponse.json({ received, sent });
    } catch (error) {
        console.error("Failed to fetch pull requests:", error);
        return NextResponse.json({ error: "Failed to fetch pull requests" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await ensureUserIdSchema();
        await ensurePullRequestSchema();
        const body = await request.json();
        const recipientIdInput = normalizeString(body.recipientId);
        const recipientQuery = normalizeString(body.recipientQuery || body.recipientName);
        const recipientLookup = recipientIdInput || recipientQuery;
        const title = normalizeString(body.title);
        const excerpt = normalizeString(body.excerpt);
        const content = normalizeString(body.content);
        const tags = normalizeTags(body.tags);
        const dmMessage = normalizeString(body.dmMessage);

        if (!recipientLookup) {
            return NextResponse.json({ error: "recipientId or recipientQuery is required" }, { status: 400 });
        }

        if (!title || !content) {
            return NextResponse.json({ error: "title and content are required" }, { status: 400 });
        }

        if (title.length > 200) {
            return NextResponse.json({ error: "title must be 200 characters or fewer" }, { status: 400 });
        }

        if (excerpt.length > 500) {
            return NextResponse.json({ error: "excerpt must be 500 characters or fewer" }, { status: 400 });
        }

        if (content.length > 50000) {
            return NextResponse.json({ error: "content is too long" }, { status: 400 });
        }

        if (dmMessage.length > 10000) {
            return NextResponse.json({ error: "dmMessage must be 10000 characters or fewer" }, { status: 400 });
        }

        const recipient = await prisma.user.findFirst({
            where: {
                OR: [
                    { id: recipientLookup },
                    { userId: recipientLookup.toLowerCase() },
                    { name: { equals: recipientLookup, mode: "insensitive" } },
                ],
            },
            select: { id: true, links: true },
        });

        if (!recipient) {
            return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
        }

        const recipientId = recipient.id;

        if (recipientId === userId) {
            return NextResponse.json({ error: "Cannot create a pull request to yourself" }, { status: 400 });
        }

        const recipientDmSetting = unpackDmSettingFromLinks(recipient.links);
        if (recipientDmSetting === "CLOSED") {
            return NextResponse.json(
                { error: "This user is not accepting pull requests or direct messages." },
                { status: 403 }
            );
        }

        await ensureDirectMessageSchema();
        if (dmMessage.length > 1000) {
            await ensureDirectMessageCapacity();
        }

        const result = await prisma.$transaction(async (tx) => {
            const pullRequest = await tx.articlePullRequest.create({
                data: {
                    proposerId: userId,
                    recipientId,
                    title,
                    excerpt: excerpt || null,
                    content,
                    tags,
                    status: PullRequestStatus.PENDING,
                },
            });

            await tx.directMessage.create({
                data: {
                    senderId: userId,
                    recipientId,
                    content: dmMessage,
                    context: DirectMessageContext.PULL_REQUEST,
                    pullRequestId: pullRequest.id,
                },
            });

            return pullRequest;
        });

        invalidatePostAndMessageCaches([userId, recipientId]);
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error("Failed to create pull request:", error);
        return NextResponse.json({ error: "Failed to create pull request" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await ensureUserIdSchema();
        await ensurePullRequestSchema();

        const body = await request.json();
        const pullRequestId = normalizeString(body.id || body.pullRequestId);
        const action = normalizeString(body.action).toLowerCase();

        if (!pullRequestId) {
            return NextResponse.json({ error: "pullRequestId is required" }, { status: 400 });
        }

        if (action !== "accept" && action !== "reject") {
            return NextResponse.json({ error: "action must be accept or reject" }, { status: 400 });
        }

        if (action === "accept") {
            await tryEnsureProfileAndPostSchema();

            const result = await prisma.$transaction(async (tx) => {
                const claimed = await tx.articlePullRequest.updateMany({
                    where: {
                        id: pullRequestId,
                        recipientId: userId,
                        status: PullRequestStatus.PENDING,
                    },
                    data: {
                        status: PullRequestStatus.ACCEPTED,
                    },
                });

                if (claimed.count === 0) {
                    const existing = await tx.articlePullRequest.findUnique({
                        where: { id: pullRequestId },
                        select: { recipientId: true, status: true },
                    });

                    if (!existing) {
                        return { kind: "missing" as const };
                    }

                    if (existing.recipientId !== userId) {
                        return { kind: "forbidden" as const };
                    }

                    return { kind: "already-handled" as const, status: existing.status };
                }

                const pullRequest = await tx.articlePullRequest.findUnique({
                    where: { id: pullRequestId },
                    select: {
                        id: true,
                        title: true,
                        excerpt: true,
                        content: true,
                        tags: true,
                        proposerId: true,
                        recipientId: true,
                    },
                });

                if (!pullRequest) {
                    throw new Error("Accepted pull request could not be reloaded.");
                }

                const post = await tx.post.create({
                    data: {
                        title: pullRequest.title,
                        content: pullRequest.content,
                        excerpt: pullRequest.excerpt || "",
                        tags: pullRequest.tags || [],
                        published: true,
                        authorId: userId,
                    },
                });

                return {
                    kind: "accepted" as const,
                    pullRequest,
                    post: {
                        id: post.id,
                    },
                };
            });

            if (result.kind === "missing") {
                return NextResponse.json({ error: "Pull request not found" }, { status: 404 });
            }

            if (result.kind === "forbidden") {
                return NextResponse.json({ error: "Only the recipient can accept this pull request" }, { status: 403 });
            }

            if (result.kind === "already-handled") {
                return NextResponse.json(
                    { error: `Pull request is already ${result.status.toLowerCase()}` },
                    { status: 409 }
                );
            }

            invalidatePostAndMessageCaches([result.pullRequest.proposerId, result.pullRequest.recipientId]);
            return NextResponse.json({ success: true, status: PullRequestStatus.ACCEPTED, post: result.post });
        }

        const result = await prisma.articlePullRequest.updateMany({
            where: {
                id: pullRequestId,
                recipientId: userId,
                status: PullRequestStatus.PENDING,
            },
            data: {
                status: PullRequestStatus.REJECTED,
            },
        });

        if (result.count === 0) {
            const existing = await prisma.articlePullRequest.findUnique({
                where: { id: pullRequestId },
                select: { recipientId: true, status: true, proposerId: true },
            });

            if (!existing) {
                return NextResponse.json({ error: "Pull request not found" }, { status: 404 });
            }

            if (existing.recipientId !== userId) {
                return NextResponse.json({ error: "Only the recipient can reject this pull request" }, { status: 403 });
            }

            return NextResponse.json(
                { error: `Pull request is already ${existing.status.toLowerCase()}` },
                { status: 409 }
            );
        }

        const updated = await prisma.articlePullRequest.findUnique({
            where: { id: pullRequestId },
            select: { proposerId: true, recipientId: true },
        });

        invalidatePostAndMessageCaches(updated ? [updated.proposerId, updated.recipientId] : [userId]);
        return NextResponse.json({ success: true, status: PullRequestStatus.REJECTED });
    } catch (error) {
        console.error("Failed to update pull request:", error);
        return NextResponse.json({ error: "Failed to update pull request" }, { status: 500 });
    }
}
