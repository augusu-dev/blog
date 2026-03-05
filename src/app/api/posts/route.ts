import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ensureUserIdSchema } from "@/lib/userId";

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

export async function GET() {
    try {
        try {
            await ensureUserIdSchema();
        } catch (schemaError) {
            console.error("Failed to ensure userId schema in posts route:", schemaError);
        }

        try {
            const posts = await prisma.post.findMany({
                where: { published: true },
                orderBy: { createdAt: "desc" },
                include: {
                    author: {
                        select: { id: true, userId: true, name: true, email: true, image: true },
                    },
                },
            });
            return NextResponse.json(posts);
        } catch (error) {
            if (!isUserIdColumnMissing(error)) throw error;
        }

        const posts = await prisma.post.findMany({
            where: { published: true },
            orderBy: { createdAt: "desc" },
            include: {
                author: {
                    select: { id: true, name: true, email: true, image: true },
                },
            },
        });
        return NextResponse.json(posts);
    } catch (error) {
        console.error("Failed to fetch posts:", error);
        return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
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
                authorId: session.user.id,
            },
        });

        return NextResponse.json(post, { status: 201 });
    } catch (error) {
        console.error("Failed to create post:", error);
        return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
    }
}
