import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { tryEnsureProfileAndPostSchema } from "@/lib/schemaCompat";
import { getPublicPostsFallback } from "@/lib/publicContentFallback";

function isSchemaMismatchError(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
        const code = String((error as { code?: unknown }).code || "");
        if (code === "P2021" || code === "P2022") return true;
    }
    if (error instanceof Error) {
        return /userId|unknown arg|column .* does not exist|relation .* does not exist|permission denied|must be owner/i.test(
            error.message
        );
    }
    return false;
}

export async function GET() {
    try {
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
            if (posts.length > 0) {
                return NextResponse.json(posts);
            }
        } catch (error) {
            if (!isSchemaMismatchError(error)) throw error;
        }

        try {
            const posts = await prisma.post.findMany({
                where: { published: true },
                orderBy: { createdAt: "desc" },
                include: {
                    author: {
                        select: { id: true, name: true, email: true, image: true },
                    },
                },
            });
            if (posts.length > 0) {
                return NextResponse.json(posts);
            }
        } catch (error) {
            if (!isSchemaMismatchError(error)) throw error;
        }

        return NextResponse.json(await getPublicPostsFallback(300));
    } catch (error) {
        try {
            return NextResponse.json(await getPublicPostsFallback(300));
        } catch (fallbackError) {
            if (isSchemaMismatchError(error) || isSchemaMismatchError(fallbackError)) {
                return NextResponse.json([]);
            }
        }
        console.error("Failed to fetch posts:", error);
        return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await tryEnsureProfileAndPostSchema();
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
                authorId: userId,
            },
        });

        return NextResponse.json(post, { status: 201 });
    } catch (error) {
        console.error("Failed to create post:", error);
        return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
    }
}
