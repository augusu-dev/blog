import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withShortPostTable } from "@/lib/shortPosts";

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    const currentUserId = session?.user?.id;
    if (!currentUserId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "Post id is required" }, { status: 400 });
    }

    try {
        const post = await withShortPostTable(() =>
            prisma.shortPost.findUnique({
                where: { id },
                select: { id: true, authorId: true },
            })
        );

        if (!post) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        if (post.authorId !== currentUserId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await withShortPostTable(() =>
            prisma.shortPost.delete({
                where: { id: post.id },
            })
        );

        return NextResponse.json({ ok: true, id: post.id });
    } catch (error) {
        console.error("Failed to delete short post:", error);
        return NextResponse.json({ error: "Failed to delete short post" }, { status: 500 });
    }
}
