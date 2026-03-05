import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSessionUserId } from "@/lib/sessionUser";

function isSchemaMismatchError(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
        const code = String((error as { code?: unknown }).code || "");
        if (code === "P2021" || code === "P2022") return true;
    }
    if (error instanceof Error) {
        return /unknown arg|column .* does not exist|relation .* does not exist|permission denied|must be owner/i.test(
            error.message
        );
    }
    return false;
}

export async function GET() {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        try {
            const posts = await prisma.post.findMany({
                where: { authorId: userId },
                orderBy: { updatedAt: "desc" },
            });
            return NextResponse.json(posts);
        } catch (error) {
            if (!isSchemaMismatchError(error)) throw error;
        }

        const minimalPosts = await prisma.post.findMany({
            where: { authorId: userId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                content: true,
                createdAt: true,
                authorId: true,
            },
        });

        return NextResponse.json(
            minimalPosts.map((post) => ({
                ...post,
                excerpt: "",
                headerImage: null,
                tags: [] as string[],
                published: true,
                pinned: false,
                updatedAt: post.createdAt,
            }))
        );
    } catch (error) {
        if (isSchemaMismatchError(error)) {
            return NextResponse.json([]);
        }
        console.error("Failed to fetch my posts:", error);
        return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
    }
}
