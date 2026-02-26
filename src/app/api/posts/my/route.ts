import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET: 自分の記事一覧（下書き含む）
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const posts = await prisma.post.findMany({
            where: { authorId: session.user.id },
            orderBy: { updatedAt: "desc" },
        });
        return NextResponse.json(posts);
    } catch (error) {
        console.error("Failed to fetch my posts:", error);
        return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
    }
}
