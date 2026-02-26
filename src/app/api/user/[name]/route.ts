import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET: 特定ユーザーの公開記事を取得
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;

    try {
        const user = await prisma.user.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                bio: true,
                aboutMe: true,
                links: true,
                posts: {
                    where: { published: true },
                    orderBy: { createdAt: "desc" },
                },
            },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({
            ...user,
            links: user.links ? JSON.parse(user.links) : [],
        });
    } catch (error) {
        console.error("Failed to fetch user:", error);
        return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
    }
}
