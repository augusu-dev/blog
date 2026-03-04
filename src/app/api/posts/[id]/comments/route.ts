import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function validateContent(content: unknown): string | null {
    if (typeof content !== "string") return null;
    const normalized = content.trim();
    if (!normalized) return null;
    if (normalized.length > 1000) return null;
    return normalized;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: postId } = await params;

    try {
        const comments = await prisma.postComment.findMany({
            where: { postId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                content: true,
                createdAt: true,
                updatedAt: true,
                author: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        return NextResponse.json(comments);
    } catch (error) {
        console.error("Failed to fetch comments:", error);
        return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    const userId = session?.user?.id;
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

        const comment = await prisma.postComment.create({
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
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        return NextResponse.json(comment, { status: 201 });
    } catch (error) {
        console.error("Failed to create comment:", error);
        return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
    }
}
