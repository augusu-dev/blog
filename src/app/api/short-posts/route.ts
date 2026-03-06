import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withShortPostTable } from "@/lib/shortPosts";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { getShortPostsFallback } from "@/lib/publicContentFallback";
import { fillMissingPublicUserIds } from "@/lib/userId";

const SHORT_POST_LIMIT = 300;
const LIST_LIMIT = 30;

function isUserIdColumnMissing(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
        const code = String((error as { code?: unknown }).code || "");
        if (code === "P2022") {
            const column = String((error as { meta?: { column?: unknown } }).meta?.column || "");
            return !column || column.includes("userId");
        }
    }
    if (error instanceof Error) {
        return /userId|unknown arg `userId`|column .*userId/i.test(error.message);
    }
    return false;
}

function isShortPostUnavailableError(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
        const code = String((error as { code?: unknown }).code || "");
        if (code === "P2021" || code === "P2022") {
            return true;
        }
    }
    if (error instanceof Error) {
        return /ShortPost|relation .*ShortPost.* does not exist|permission denied|must be owner/i.test(
            error.message
        );
    }
    return false;
}

function normalizeContent(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

async function attachPublicUserIds<
    T extends Array<{
        author: {
            id: string;
            userId?: string | null;
            name: string | null;
            email: string | null;
            image: string | null;
        };
    }>,
>(posts: T): Promise<T> {
    const hydratedAuthors = await fillMissingPublicUserIds(posts.map((post) => post.author));
    const authorById = new Map(hydratedAuthors.map((author) => [author.id, author]));

    return posts.map((post) => ({
        ...post,
        author: authorById.get(post.author.id) || post.author,
    })) as T;
}

export async function GET(_req: Request) {
    try {
        let posts:
            | Array<{
                  id: string;
                  content: string;
                  createdAt: string | Date;
                  authorId: string;
                  author: {
                      id: string;
                      userId?: string | null;
                      name: string | null;
                      email: string | null;
                      image: string | null;
                  };
              }>
            | null = null;

        try {
            posts = await withShortPostTable(() =>
                prisma.shortPost.findMany({
                    orderBy: { createdAt: "desc" },
                    take: LIST_LIMIT,
                    include: {
                        author: {
                            select: {
                                id: true,
                                userId: true,
                                name: true,
                                email: true,
                                image: true,
                            },
                        },
                    },
                })
            );
        } catch (error) {
            if (!isUserIdColumnMissing(error)) throw error;
        }

        if (!posts) {
            posts = await getShortPostsFallback(LIST_LIMIT);
        }

        return NextResponse.json(await attachPublicUserIds(posts));
    } catch (error) {
        try {
            return NextResponse.json(await attachPublicUserIds(await getShortPostsFallback(LIST_LIMIT)));
        } catch (fallbackError) {
            if (isShortPostUnavailableError(error) || isShortPostUnavailableError(fallbackError)) {
                return NextResponse.json([]);
            }
        }
        console.error("Failed to fetch short posts:", error);
        return NextResponse.json({ error: "Failed to fetch short posts" }, { status: 500 });
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
        const content = normalizeContent(body.content);
        if (!content || content.length > SHORT_POST_LIMIT) {
            return NextResponse.json(
                { error: `Post must be 1-${SHORT_POST_LIMIT} characters.` },
                { status: 400 }
            );
        }

        let post:
            | {
                  id: string;
                  content: string;
                  createdAt: Date;
                  authorId: string;
                  author: {
                      id: string;
                      userId?: string | null;
                      name: string | null;
                      email: string | null;
                      image: string | null;
                  };
              }
            | null = null;

        try {
            post = await withShortPostTable(() =>
                prisma.shortPost.create({
                    data: { content, authorId: userId },
                    include: {
                        author: {
                            select: {
                                id: true,
                                userId: true,
                                name: true,
                                email: true,
                                image: true,
                            },
                        },
                    },
                })
            );
        } catch (error) {
            if (!isUserIdColumnMissing(error)) throw error;
        }

        if (!post) {
            post = await withShortPostTable(() =>
                prisma.shortPost.create({
                    data: { content, authorId: userId },
                    include: {
                        author: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                image: true,
                            },
                        },
                    },
                })
            );
        }

        return NextResponse.json((await attachPublicUserIds([post]))[0], { status: 201 });
    } catch (error) {
        console.error("Failed to create short post:", error);
        return NextResponse.json({ error: "Failed to create short post" }, { status: 500 });
    }
}
