import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { getPostsByAuthorFallback } from "@/lib/publicContentFallback";
import { hydratePullRequestProposers } from "@/lib/pullRequestPostMeta";
import { formatIsoDate } from "@/lib/pullRequestPublication";
import {
    isRecoverableReadError,
    isSchemaCompatibilityError,
    isTransientDatabaseError,
} from "@/lib/prismaErrors";
import { readCacheKeys, readThroughCache } from "@/lib/readCache";
import { fillMissingPublicUserIds } from "@/lib/userId";

const USER_POSTS_CACHE_TTL_MS = 15 * 1000;
const PUBLIC_USER_SELECT = {
    id: true,
    userId: true,
    name: true,
    email: true,
    image: true,
} as const;

function normalizeAuthorRefs(values: Array<string | null | undefined>): string[] {
    const refs = new Set<string>();

    for (const value of values) {
        const normalized = typeof value === "string" ? value.trim() : "";
        if (normalized) {
            refs.add(normalized);
        }
    }

    return [...refs];
}

export async function GET() {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authorRefs = normalizeAuthorRefs([
        userId,
        typeof session?.user?.userId === "string" ? session.user.userId : null,
    ]);
    const authorWhere =
        authorRefs.length <= 1 ? { authorId: authorRefs[0] || userId } : { authorId: { in: authorRefs } };

    try {
        const payload = await readThroughCache(
            readCacheKeys.userPosts(userId),
            USER_POSTS_CACHE_TTL_MS,
            async () => {
                const now = new Date();

                try {
                    const posts = await prisma.post.findMany({
                        where: authorWhere,
                        orderBy: { updatedAt: "desc" },
                        select: {
                            id: true,
                            title: true,
                            content: true,
                            excerpt: true,
                            headerImage: true,
                            tags: true,
                            published: true,
                            pinned: true,
                            createdAt: true,
                            updatedAt: true,
                            authorId: true,
                            sourcePullRequestId: true,
                            pullRequestProposerId: true,
                        },
                    });

                    const postIds = posts.map((post) => post.id);
                    let publicationGrants: Array<{
                        id: string;
                        createdAt: Date;
                        expiresAt: Date;
                        sourcePullRequestId: string | null;
                        postId: string;
                        host: {
                            id: string;
                            userId?: string | null;
                            name: string | null;
                            email: string | null;
                            image: string | null;
                        };
                    }> = [];

                    if (postIds.length > 0) {
                        try {
                            publicationGrants = await prisma.postPublicationGrant.findMany({
                                where: {
                                    postId: { in: postIds },
                                    expiresAt: { gt: now },
                                },
                                orderBy: { expiresAt: "asc" },
                                select: {
                                    id: true,
                                    createdAt: true,
                                    expiresAt: true,
                                    sourcePullRequestId: true,
                                    postId: true,
                                    host: { select: PUBLIC_USER_SELECT },
                                },
                            });
                        } catch (error) {
                            if (!isRecoverableReadError(error)) {
                                throw error;
                            }
                        }
                    }

                    const hosts = await fillMissingPublicUserIds(publicationGrants.map((grant) => grant.host));
                    const hostById = new Map(hosts.map((host) => [host.id, host]));
                    const grantsByPostId = new Map<string, typeof publicationGrants>();
                    for (const grant of publicationGrants) {
                        const current = grantsByPostId.get(grant.postId) || [];
                        current.push(grant);
                        grantsByPostId.set(grant.postId, current);
                    }
                    const visiblePosts = posts.filter(
                        (post) => !(post.sourcePullRequestId && post.pullRequestProposerId)
                    );
                    const hydratedPosts = await hydratePullRequestProposers(visiblePosts);

                    return hydratedPosts.map((post) => ({
                        ...post,
                        publicationGrants: (grantsByPostId.get(post.id) || []).map((grant) => ({
                            ...grant,
                            createdAt: formatIsoDate(grant.createdAt),
                            expiresAt: formatIsoDate(grant.expiresAt),
                            host: hostById.get(grant.host.id) || grant.host,
                        })),
                    }));
                } catch (error) {
                    if (isTransientDatabaseError(error)) throw error;
                    if (!isSchemaCompatibilityError(error)) throw error;
                }

                return (await hydratePullRequestProposers(
                    (await getPostsByAuthorFallback(authorRefs, { publishedOnly: false, limit: 300 })).filter(
                        (post) => !(post.sourcePullRequestId && post.pullRequestProposerId)
                    )
                )).map((post) => ({
                    ...post,
                    publicationGrants: [],
                }));
            },
            {
                shouldCache: (value) => Array.isArray(value) && value.length > 0,
                useStaleOnError: true,
                useStaleWhen: (value, staleValue) =>
                    Array.isArray(value) &&
                    value.length === 0 &&
                    Array.isArray(staleValue) &&
                    staleValue.length > 0,
            }
        );

        return NextResponse.json(payload);
    } catch (error) {
        try {
            return NextResponse.json(
                (await hydratePullRequestProposers(
                    (await getPostsByAuthorFallback(authorRefs, { publishedOnly: false, limit: 300 })).filter(
                        (post) => !(post.sourcePullRequestId && post.pullRequestProposerId)
                    )
                )).map((post) => ({
                    ...post,
                    publicationGrants: [],
                }))
            );
        } catch (fallbackError) {
            void fallbackError;
        }
        if (isTransientDatabaseError(error)) {
            return NextResponse.json([]);
        }
        console.error("Failed to fetch my posts:", error);
        return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
    }
}
