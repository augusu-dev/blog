import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { tryEnsureProfileAndPostSchema } from "@/lib/schemaCompat";
import { buildPublicCacheHeaders } from "@/lib/publicCacheHeaders";
import { getPublicPostsFallback } from "@/lib/publicContentFallback";
import { hydratePullRequestProposers } from "@/lib/pullRequestPostMeta";
import { formatIsoDate } from "@/lib/pullRequestPublication";
import {
    isRecoverableReadError,
    isTransientDatabaseError,
    retryTransientRead,
} from "@/lib/prismaErrors";
import { fillMissingPublicUserIds } from "@/lib/userId";
import { invalidateReadCachePrefix, readCacheKeys, readThroughCache } from "@/lib/readCache";

const PUBLIC_POSTS_CACHE_TTL_MS = 20 * 1000;
const PUBLIC_USER_SELECT = {
    id: true,
    userId: true,
    name: true,
    email: true,
    image: true,
} as const;

async function attachPostUsers<
    T extends Array<{
        author?: {
            id: string;
            userId?: string | null;
            name: string | null;
            email: string | null;
            image: string | null;
        } | null;
        pullRequestProposerId?: string | null;
        pullRequestProposer?: {
            id: string;
            userId?: string | null;
            name: string | null;
            email: string | null;
            image: string | null;
        } | null;
    }>,
>(posts: T): Promise<T> {
    const authors = posts
        .map((post) => post.author)
        .filter((author): author is NonNullable<(typeof posts)[number]["author"]> => !!author?.id);
    const hydratedAuthors = await fillMissingPublicUserIds(authors);
    const authorById = new Map(hydratedAuthors.map((author) => [author.id, author]));

    const postsWithAuthors = posts.map((post) =>
        post.author?.id
            ? {
                  ...post,
                  author: authorById.get(post.author.id) || post.author,
              }
            : post
    ) as T;

    return (await hydratePullRequestProposers(postsWithAuthors)) as T;
}

async function loadHostedPublicPosts(now: Date) {
    const grants = await prisma.postPublicationGrant.findMany({
        where: { expiresAt: { gt: now } },
        include: {
            host: { select: PUBLIC_USER_SELECT },
            post: {
                include: {
                    author: { select: PUBLIC_USER_SELECT },
                },
            },
        },
    });

    return grants.map((grant) => ({
        ...grant.post,
        createdAt: grant.createdAt,
        updatedAt: grant.post.updatedAt,
        published: true,
        pinned: false,
        authorId: grant.host.id,
        author: grant.host,
        sourcePullRequestId: grant.sourcePullRequestId || grant.post.sourcePullRequestId || `grant:${grant.id}`,
        pullRequestProposerId: grant.post.authorId,
        pullRequestProposer: grant.post.author,
        publicationGrantId: grant.id,
        publicationExpiresAt: formatIsoDate(grant.expiresAt),
    }));
}

export async function GET() {
    try {
        const payload = await readThroughCache(
            readCacheKeys.publicPosts(),
            PUBLIC_POSTS_CACHE_TTL_MS,
            async () => {
                const now = new Date();

                try {
                    const publishedPosts = await retryTransientRead(() =>
                        prisma.post.findMany({
                            where: { published: true },
                            orderBy: { createdAt: "desc" },
                            include: {
                                author: {
                                    select: PUBLIC_USER_SELECT,
                                },
                            },
                        })
                    );

                    let hostedPosts: Awaited<ReturnType<typeof loadHostedPublicPosts>> = [];
                    try {
                        hostedPosts = await retryTransientRead(() => loadHostedPublicPosts(now));
                    } catch (error) {
                        if (!isRecoverableReadError(error)) {
                            throw error;
                        }
                    }

                    const combinedPosts = [...publishedPosts, ...hostedPosts].sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    );

                    if (combinedPosts.length > 0) {
                        return await attachPostUsers(combinedPosts);
                    }
                } catch (error) {
                    if (!isRecoverableReadError(error)) throw error;
                }

                const fallbackPosts = await getPublicPostsFallback(300);
                return await fillMissingPublicUserIds(fallbackPosts.map((post) => post.author)).then(async (authors) => {
                    const authorById = new Map(authors.map((author) => [author.id, author]));
                    const postsWithAuthors = fallbackPosts.map((post) => ({
                        ...post,
                        author: authorById.get(post.author.id) || post.author,
                    }));
                    return hydratePullRequestProposers(postsWithAuthors);
                });
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

        return NextResponse.json(payload, {
            headers: buildPublicCacheHeaders({ sMaxAge: 30, staleWhileRevalidate: 180 }),
        });
    } catch (error) {
        if (isTransientDatabaseError(error)) {
            return NextResponse.json(await getPublicPostsFallback(300), {
                headers: buildPublicCacheHeaders({ sMaxAge: 15, staleWhileRevalidate: 60 }),
            });
        }
        console.error("Failed to fetch posts:", error);
        return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await tryEnsureProfileAndPostSchema();
        const body = await request.json();
        const { title, content, excerpt, headerImage, tags, published } = body;

        if (!title || !content) {
            return NextResponse.json(
                { error: "Title and content are required" },
                { status: 400 }
            );
        }

        const post = await prisma.post.create({
            data: {
                title,
                content,
                excerpt: excerpt || "",
                headerImage: headerImage || null,
                tags: tags || [],
                published: published ?? false,
                authorId: userId,
            },
        });

        invalidateReadCachePrefix(readCacheKeys.publicPosts());
        invalidateReadCachePrefix("user-profile:");
        invalidateReadCachePrefix("user-posts:");
        invalidateReadCachePrefix("pins-feed:");

        return NextResponse.json(post, { status: 201 });
    } catch (error) {
        console.error("Failed to create post:", error);
        return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
    }
}
