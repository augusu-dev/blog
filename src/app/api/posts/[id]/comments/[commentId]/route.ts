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

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; commentId: string }> }
) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: postId, commentId } = await params;

    try {
        const { content } = await request.json();
        const normalized = validateContent(content);

        if (!normalized) {
            return NextResponse.json({ error: "Invalid comment content" }, { status: 400 });
        }

        const existing = await prisma.postComment.findUnique({
            where: { id: commentId },
            select: {
                id: true,
                postId: true,
                authorId: true,
            },
        });

        if (!existing || existing.postId !== postId) {
            return NextResponse.json({ error: "Comment not found" }, { status: 404 });
        }

        if (existing.authorId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const updated = await prisma.postComment.update({
            where: { id: commentId },
            data: { content: normalized },
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

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Failed to update comment:", error);
        return NextResponse.json({ error: "Failed to update comment" }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; commentId: string }> }
) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: postId, commentId } = await params;

    try {
        const existing = await prisma.postComment.findUnique({
            where: { id: commentId },
            select: {
                id: true,
                postId: true,
                authorId: true,
            },
        });

        if (!existing || existing.postId !== postId) {
            return NextResponse.json({ error: "Comment not found" }, { status: 404 });
        }

        if (existing.authorId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await prisma.postComment.delete({ where: { id: commentId } });

        return NextResponse.json({ ok: true, id: commentId });
    } catch (error) {
        console.error("Failed to delete comment:", error);
        return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
    }
}