import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { getPostsByAuthorFallback } from "@/lib/publicContentFallback";
import { hydratePullRequestProposers } from "@/lib/pullRequestPostMeta";
import { ensurePullRequestSchema } from "@/lib/pullRequests";
import { formatIsoDate } from "@/lib/pullRequestPublication";
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

function isSchemaMismatchError(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
        const code = String((error as { code?: unknown }).code || "");
        if (code === "P2021" || code === "P2022") return true;
    }
    if (error instanceof Error) {
        return /unknown arg|column .* does not exist|relation .* does not exist|permission denied|must be owner/i.test(
            error.message
        );
    }
    return false;
}

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
                    await ensurePullRequestSchema();
                } catch {
                    // Keep compatibility fallbacks below.
                }

                try {
                    const posts = await prisma.post.findMany({
                        where: authorWhere,
                        orderBy: { updatedAt: "desc" },
                        include: {
                            publicationGrants: {
                                where: { expiresAt: { gt: now } },
                                orderBy: { expiresAt: "asc" },
                                select: {
                                    id: true,
                                    createdAt: true,
                                    expiresAt: true,
                                    sourcePullRequestId: true,
                                    host: { select: PUBLIC_USER_SELECT },
                                },
                            },
                        },
                    });

                    const hosts = await fillMissingPublicUserIds(
                        posts.flatMap((post) => post.publicationGrants.map((grant) => grant.host))
                    );
                    const hostById = new Map(hosts.map((host) => [host.id, host]));
                    const hydratedPosts = await hydratePullRequestProposers(posts);

                    return hydratedPosts.map((post) => ({
                        ...post,
                        publicationGrants: post.publicationGrants.map((grant) => ({
                            ...grant,
                            createdAt: formatIsoDate(grant.createdAt),
                            expiresAt: formatIsoDate(grant.expiresAt),
                            host: hostById.get(grant.host.id) || grant.host,
                        })),
                    }));
                } catch (error) {
                    if (!isSchemaMismatchError(error)) throw error;
                }

                return (await hydratePullRequestProposers(
                    await getPostsByAuthorFallback(authorRefs, { publishedOnly: false, limit: 300 })
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
                    await getPostsByAuthorFallback(authorRefs, { publishedOnly: false, limit: 300 })
                )).map((post) => ({
                    ...post,
                    publicationGrants: [],
                }))
            );
        } catch (fallbackError) {
            void fallbackError;
        }
        console.error("Failed to fetch my posts:", error);
        return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
    }
}
