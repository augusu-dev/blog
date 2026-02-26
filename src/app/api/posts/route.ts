import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET: 記事一覧取得（公開記事のみ、未認証でもOK）
export async function GET() {
    try {
        const posts = await prisma.post.findMany({
            where: { published: true },
            orderBy: { createdAt: "desc" },
            include: {
                author: {
                    select: { name: true, email: true },
                },
            },
        });
        return NextResponse.json(posts);
    } catch (error) {
        console.error("Failed to fetch posts:", error);
        return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
    }
}

// POST: 新規記事作成（認証必須）
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { title, content, excerpt, tags, published } = body;

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
                tags: tags || [],
                published: published ?? false,
                authorId: session.user.id,
            },
        });

        return NextResponse.json(post, { status: 201 });
    } catch (error) {
        console.error("Failed to create post:", error);
        return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
    }
}
