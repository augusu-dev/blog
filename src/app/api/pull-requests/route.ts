import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DirectMessageContext, PullRequestKind, PullRequestStatus } from "@prisma/client";
import { ensureDirectMessageCapacity, ensureDirectMessageSchema } from "@/lib/directMessages";
import { ensurePullRequestSchema, withPullRequestTable } from "@/lib/pullRequests";
import { tryEnsureProfileAndPostSchema } from "@/lib/schemaCompat";
import { ensureUserIdSchema } from "@/lib/userId";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { invalidateReadCachePrefix, normalizeCacheKeyPart, readCacheKeys } from "@/lib/readCache";
import {
    canRequestPullRequestExtension,
    createPullRequestPublicationExpiry,
} from "@/lib/pullRequestPublication";

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

function parsePullRequestKind(value: unknown): PullRequestKind {
    return value === PullRequestKind.EXTENSION ? PullRequestKind.EXTENSION : PullRequestKind.SUBMISSION;
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

async function resolveRecipient(recipientLookup: string) {
    return prisma.user.findFirst({
        where: {
            OR: [
                { id: recipientLookup },
                { userId: recipientLookup.toLowerCase() },
                { name: { equals: recipientLookup, mode: "insensitive" } },
            ],
        },
        select: { id: true, links: true },
    });
}

async function getOwnedPostForPullRequest(postId: string, userId: string) {
    return prisma.post.findUnique({
        where: { id: postId },
        select: {
            id: true,
            title: true,
            excerpt: true,
            content: true,
            tags: true,
            published: true,
            authorId: true,
            publicationGrants: {
                select: {
                    id: true,
                    expiresAt: true,
                    hostUserId: true,
                    host: {
                        select: { id: true, name: true, email: true, image: true, userId: true },
                    },
                },
            },
        },
    }).then((post) => {
        if (!post) return null;
        if (post.authorId !== userId) return { ...post, forbidden: true as const };
        return post;
    });
}

export async function GET() {
    const session = await auth();
    const userId = await resolveSessionUserId(session as any); /* eslint-disable-line @typescript-eslint/no-explicit-any */
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
    const userId = await resolveSessionUserId(session as any); /* eslint-disable-line @typescript-eslint/no-explicit-any */
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await ensureUserIdSchema();
        await ensurePullRequestSchema();
        await tryEnsureProfileAndPostSchema();

        const body = await request.json();
        const kind = parsePullRequestKind(body.kind);
        const recipientIdInput = normalizeString(body.recipientId);
        const recipientQuery = normalizeString(body.recipientQuery || body.recipientName);
        const recipientLookup = recipientIdInput || recipientQuery;
        const postId = normalizeString(body.postId);
        const requestedTitle = normalizeString(body.title);
        const requestedExcerpt = normalizeString(body.excerpt);
        const requestedContent = normalizeString(body.content);
        const requestedTags = normalizeTags(body.tags);
        const dmMessage = normalizeString(body.dmMessage);

        if (!recipientLookup) {
            return NextResponse.json({ error: "recipientId or recipientQuery is required" }, { status: 400 });
        }

        if (dmMessage.length > 10000) {
            return NextResponse.json({ error: "dmMessage must be 10000 characters or fewer" }, { status: 400 });
        }

        const recipient = await resolveRecipient(recipientLookup);
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

        if (recipientDmSetting === "PR_ONLY" && dmMessage) {
            return NextResponse.json(
                { error: "This user only accepts pull requests without optional direct-message text." },
                { status: 403 }
            );
        }

        await ensureDirectMessageSchema();
        if (dmMessage.length > 1000) {
            await ensureDirectMessageCapacity();
        }

        const now = new Date();

        const result = await prisma.$transaction(async (tx) => {
            let post = null as
                | {
                      id: string;
                      title: string;
                      excerpt: string | null;
                      content: string;
                      tags: string[];
                      authorId: string;
                      publicationGrants: Array<{
                          id: string;
                          expiresAt: Date;
                          hostUserId: string;
                          host: {
                              id: string;
                              userId: string | null;
                              name: string | null;
                              email: string | null;
                              image: string | null;
                          };
                      }>;
                  }
                | null;

            let title = requestedTitle;
            let excerpt = requestedExcerpt;
            let content = requestedContent;
            let tags = requestedTags;
            let publicationExpiresAt: Date | null = null;

            if (kind === PullRequestKind.EXTENSION) {
                if (!postId) {
                    return { kind: "bad-request" as const, error: "postId is required for extension requests" };
                }

                const existingPost = await getOwnedPostForPullRequest(postId, userId);
                if (!existingPost) {
                    return { kind: "missing-post" as const };
                }

                if ("forbidden" in existingPost) {
                    return { kind: "forbidden-post" as const };
                }

                const currentGrant = existingPost.publicationGrants.find(
                    (grant) => grant.hostUserId === recipientId && grant.expiresAt.getTime() > now.getTime()
                );

                if (!currentGrant) {
                    return { kind: "no-grant" as const };
                }

                if (!canRequestPullRequestExtension(currentGrant.expiresAt, now)) {
                    return { kind: "too-early" as const, expiresAt: currentGrant.expiresAt };
                }

                const openExtension = await tx.articlePullRequest.findFirst({
                    where: {
                        kind: PullRequestKind.EXTENSION,
                        postId: existingPost.id,
                        proposerId: userId,
                        recipientId,
                        status: { in: [PullRequestStatus.PENDING, PullRequestStatus.ON_HOLD] },
                    },
                    select: { id: true },
                });

                if (openExtension) {
                    return { kind: "extension-exists" as const };
                }

                post = existingPost;
                title = existingPost.title;
                excerpt = existingPost.excerpt || "";
                content = existingPost.content;
                tags = existingPost.tags || [];
                publicationExpiresAt = currentGrant.expiresAt;
            } else {
                if (postId) {
                    const existingPost = await getOwnedPostForPullRequest(postId, userId);
                    if (!existingPost) {
                        return { kind: "missing-post" as const };
                    }

                    if ("forbidden" in existingPost) {
                        return { kind: "forbidden-post" as const };
                    }

                    title = title || existingPost.title;
                    excerpt = excerpt || existingPost.excerpt || "";
                    content = content || existingPost.content;
                    tags = tags.length > 0 ? tags : existingPost.tags || [];

                    if (!title || !content) {
                        return { kind: "bad-request" as const, error: "title and content are required" };
                    }

                    if (title.length > 200) {
                        return { kind: "bad-request" as const, error: "title must be 200 characters or fewer" };
                    }

                    if (excerpt.length > 500) {
                        return { kind: "bad-request" as const, error: "excerpt must be 500 characters or fewer" };
                    }

                    if (content.length > 50000) {
                        return { kind: "bad-request" as const, error: "content is too long" };
                    }

                    post = await tx.post.update({
                        where: { id: existingPost.id },
                        data: {
                            title,
                            excerpt,
                            content,
                            tags,
                        },
                        select: {
                            id: true,
                            title: true,
                            excerpt: true,
                            content: true,
                            tags: true,
                            authorId: true,
                            publicationGrants: {
                                select: {
                                    id: true,
                                    expiresAt: true,
                                    hostUserId: true,
                                    host: {
                                        select: { id: true, userId: true, name: true, email: true, image: true },
                                    },
                                },
                            },
                        },
                    });
                } else {
                    if (!title || !content) {
                        return { kind: "bad-request" as const, error: "title and content are required" };
                    }

                    if (title.length > 200) {
                        return { kind: "bad-request" as const, error: "title must be 200 characters or fewer" };
                    }

                    if (excerpt.length > 500) {
                        return { kind: "bad-request" as const, error: "excerpt must be 500 characters or fewer" };
                    }

                    if (content.length > 50000) {
                        return { kind: "bad-request" as const, error: "content is too long" };
                    }

                    post = await tx.post.create({
                        data: {
                            title,
                            excerpt,
                            content,
                            tags,
                            published: false,
                            authorId: userId,
                        },
                        select: {
                            id: true,
                            title: true,
                            excerpt: true,
                            content: true,
                            tags: true,
                            authorId: true,
                            publicationGrants: {
                                select: {
                                    id: true,
                                    expiresAt: true,
                                    hostUserId: true,
                                    host: {
                                        select: { id: true, userId: true, name: true, email: true, image: true },
                                    },
                                },
                            },
                        },
                    });
                }
            }

            if (!post) {
                return { kind: "bad-request" as const, error: "post could not be prepared" };
            }

            const pullRequest = await tx.articlePullRequest.create({
                data: {
                    proposerId: userId,
                    recipientId,
                    postId: post.id,
                    title,
                    excerpt: excerpt || null,
                    content,
                    tags,
                    kind,
                    status: PullRequestStatus.PENDING,
                    publicationExpiresAt,
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

            return { kind: "created" as const, pullRequest, postId: post.id };
        });

        if (result.kind === "bad-request") {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        if (result.kind === "missing-post") {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        if (result.kind === "forbidden-post") {
            return NextResponse.json({ error: "Only the post author can send this pull request" }, { status: 403 });
        }

        if (result.kind === "no-grant") {
            return NextResponse.json({ error: "No active hosted publication was found for that user" }, { status: 409 });
        }

        if (result.kind === "too-early") {
            return NextResponse.json(
                { error: "Extension requests can only be sent during the final 7 days of publication.", expiresAt: result.expiresAt },
                { status: 409 }
            );
        }

        if (result.kind === "extension-exists") {
            return NextResponse.json({ error: "An extension request is already pending for this host." }, { status: 409 });
        }

        invalidatePostAndMessageCaches([userId, recipientId]);
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error("Failed to create pull request:", error);
        return NextResponse.json({ error: "Failed to create pull request" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session as any); /* eslint-disable-line @typescript-eslint/no-explicit-any */
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

        if (action !== "accept" && action !== "hold" && action !== "reject") {
            return NextResponse.json({ error: "action must be accept, hold, or reject" }, { status: 400 });
        }

        if (action === "hold") {
            const result = await prisma.articlePullRequest.updateMany({
                where: {
                    id: pullRequestId,
                    recipientId: userId,
                    status: PullRequestStatus.PENDING,
                },
                data: {
                    status: PullRequestStatus.ON_HOLD,
                },
            });

            if (result.count === 0) {
                const existing = await prisma.articlePullRequest.findUnique({
                    where: { id: pullRequestId },
                    select: { recipientId: true, status: true },
                });

                if (!existing) {
                    return NextResponse.json({ error: "Pull request not found" }, { status: 404 });
                }

                if (existing.recipientId !== userId) {
                    return NextResponse.json({ error: "Only the recipient can hold this pull request" }, { status: 403 });
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
            return NextResponse.json({ success: true, status: PullRequestStatus.ON_HOLD });
        }

        if (action === "accept") {
            await tryEnsureProfileAndPostSchema();

            const result = await prisma.$transaction(async (tx) => {
                const claimed = await tx.articlePullRequest.updateMany({
                    where: {
                        id: pullRequestId,
                        recipientId: userId,
                        status: { in: [PullRequestStatus.PENDING, PullRequestStatus.ON_HOLD] },
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
                        kind: true,
                        title: true,
                        excerpt: true,
                        content: true,
                        tags: true,
                        proposerId: true,
                        recipientId: true,
                        postId: true,
                        publicationExpiresAt: true,
                    },
                });

                if (!pullRequest) {
                    throw new Error("Accepted pull request could not be reloaded.");
                }

                let canonicalPostId = pullRequest.postId;
                if (canonicalPostId) {
                    const existingPost = await tx.post.findUnique({
                        where: { id: canonicalPostId },
                        select: { id: true, authorId: true },
                    });

                    if (!existingPost || existingPost.authorId !== pullRequest.proposerId) {
                        canonicalPostId = null;
                    }
                }

                if (!canonicalPostId) {
                    const createdPost = await tx.post.create({
                        data: {
                            title: pullRequest.title,
                            content: pullRequest.content,
                            excerpt: pullRequest.excerpt || "",
                            tags: pullRequest.tags || [],
                            published: false,
                            authorId: pullRequest.proposerId,
                        },
                        select: { id: true },
                    });
                    canonicalPostId = createdPost.id;
                }

                const currentGrant = await tx.postPublicationGrant.findUnique({
                    where: {
                        postId_hostUserId: {
                            postId: canonicalPostId,
                            hostUserId: userId,
                        },
                    },
                    select: {
                        id: true,
                        expiresAt: true,
                    },
                });

                const nextExpiry =
                    pullRequest.kind === PullRequestKind.EXTENSION
                        ? createPullRequestPublicationExpiry(
                              currentGrant && currentGrant.expiresAt.getTime() > Date.now()
                                  ? currentGrant.expiresAt
                                  : new Date()
                          )
                        : createPullRequestPublicationExpiry(new Date());

                if (pullRequest.kind === PullRequestKind.EXTENSION && !currentGrant) {
                    return {
                        kind: "no-grant" as const,
                        pullRequest,
                    };
                }

                const grant = await tx.postPublicationGrant.upsert({
                    where: {
                        postId_hostUserId: {
                            postId: canonicalPostId,
                            hostUserId: userId,
                        },
                    },
                    update: {
                        expiresAt: nextExpiry,
                        sourcePullRequestId: pullRequest.id,
                    },
                    create: {
                        postId: canonicalPostId,
                        hostUserId: userId,
                        expiresAt: nextExpiry,
                        sourcePullRequestId: pullRequest.id,
                    },
                    select: {
                        id: true,
                        expiresAt: true,
                        postId: true,
                    },
                });

                await tx.articlePullRequest.update({
                    where: { id: pullRequest.id },
                    data: {
                        postId: canonicalPostId,
                        publicationExpiresAt: grant.expiresAt,
                    },
                });

                return {
                    kind: "accepted" as const,
                    pullRequest,
                    publication: {
                        id: grant.id,
                        postId: grant.postId,
                        expiresAt: grant.expiresAt,
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

            if (result.kind === "no-grant") {
                return NextResponse.json(
                    { error: "The hosted publication to extend no longer exists." },
                    { status: 409 }
                );
            }

            invalidatePostAndMessageCaches([result.pullRequest.proposerId, result.pullRequest.recipientId]);
            return NextResponse.json({
                success: true,
                status: PullRequestStatus.ACCEPTED,
                publication: result.publication,
            });
        }

        const result = await prisma.articlePullRequest.updateMany({
            where: {
                id: pullRequestId,
                recipientId: userId,
                status: { in: [PullRequestStatus.PENDING, PullRequestStatus.ON_HOLD] },
            },
            data: {
                status: PullRequestStatus.REJECTED,
            },
        });

        if (result.count === 0) {
            const existing = await prisma.articlePullRequest.findUnique({
                where: { id: pullRequestId },
                select: { recipientId: true, status: true },
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
