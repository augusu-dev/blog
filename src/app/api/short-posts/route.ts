import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withShortPostTable } from "@/lib/shortPosts";

const SHORT_POST_LIMIT = 300;
const LIST_LIMIT = 30;

function normalizeContent(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
    try {
        const posts = await withShortPostTable(() =>
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
        return NextResponse.json(posts);
    } catch (error) {
        console.error("Failed to fetch short posts:", error);
        return NextResponse.json({ error: "Failed to fetch short posts" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await auth();
    const userId = session?.user?.id;
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

        const post = await withShortPostTable(() =>
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

        return NextResponse.json(post, { status: 201 });
    } catch (error) {
        console.error("Failed to create short post:", error);
        return NextResponse.json({ error: "Failed to create short post" }, { status: 500 });
    }
}
