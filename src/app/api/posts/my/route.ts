import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { getPostsByAuthorFallback } from "@/lib/publicContentFallback";
import { readCacheKeys, readThroughCache } from "@/lib/readCache";

const USER_POSTS_CACHE_TTL_MS = 15 * 1000;

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
                try {
                    const posts = await prisma.post.findMany({
                        where: authorWhere,
                        orderBy: { updatedAt: "desc" },
                    });
                    return posts;
                } catch (error) {
                    if (!isSchemaMismatchError(error)) throw error;
                }

                return getPostsByAuthorFallback(authorRefs, { publishedOnly: false, limit: 300 });
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
                await getPostsByAuthorFallback(authorRefs, { publishedOnly: false, limit: 300 })
            );
        } catch (fallbackError) {
            void fallbackError;
        }
        console.error("Failed to fetch my posts:", error);
        return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
    }
}
