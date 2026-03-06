import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { COMMENT_AUTHOR_SELECT, withPostCommentTable } from "@/lib/postComments";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { fillMissingPublicUserIds } from "@/lib/userId";

function validateContent(content: unknown): string | null {
    if (typeof content !== "string") return null;
    const normalized = content.trim();
    if (!normalized) return null;
    if (normalized.length > 1000) return null;
    return normalized;
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
>(comments: T): Promise<T> {
    const hydratedAuthors = await fillMissingPublicUserIds(comments.map((comment) => comment.author));
    const authorById = new Map(hydratedAuthors.map((author) => [author.id, author]));

    return comments.map((comment) => ({
        ...comment,
        author: authorById.get(comment.author.id) || comment.author,
    })) as T;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: postId } = await params;

    try {
        const comments = await withPostCommentTable(() =>
            prisma.postComment.findMany({
            where: { postId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                content: true,
                createdAt: true,
                updatedAt: true,
                author: {
                    select: COMMENT_AUTHOR_SELECT,
                },
            },
            })
        );

        return NextResponse.json(await attachPublicUserIds(comments));
    } catch (error) {
        console.error("Failed to fetch comments:", error);
        return NextResponse.json([]);
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth(request as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    const userId = await resolveSessionUserId(session as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: postId } = await params;

    try {
        const { content } = await request.json();
        const normalized = validateContent(content);

        if (!normalized) {
            return NextResponse.json({ error: "Invalid comment content" }, { status: 400 });
        }

        const post = await prisma.post.findUnique({
            where: { id: postId },
            select: { id: true },
        });

        if (!post) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        const comment = await withPostCommentTable(() =>
            prisma.postComment.create({
            data: {
                content: normalized,
                postId,
                authorId: userId,
            },
            select: {
                id: true,
                content: true,
                createdAt: true,
                updatedAt: true,
                author: {
                    select: COMMENT_AUTHOR_SELECT,
                },
            },
            })
        );

        return NextResponse.json((await attachPublicUserIds([comment]))[0], { status: 201 });
    } catch (error) {
        console.error("Failed to create comment:", error);
        return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
    }
}
