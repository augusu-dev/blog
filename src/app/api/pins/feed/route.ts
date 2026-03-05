import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withPinnedUserTable } from "@/lib/pinnedUsers";

const FEED_LIMIT = 120;

export async function GET() {
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const pinnedRows = await withPinnedUserTable(() =>
            prisma.pinnedUser.findMany({
                where: { ownerId },
                orderBy: { createdAt: "desc" },
                select: {
                    pinnedUserId: true,
                    createdAt: true,
                    pinnedUser: {
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

        const pinnedUserIds = pinnedRows.map((row) => row.pinnedUserId);
        if (pinnedUserIds.length === 0) {
            return NextResponse.json({ pinnedCount: 0, pinnedUsers: [], posts: [] });
        }

        const posts = await prisma.post.findMany({
            where: {
                published: true,
                authorId: { in: pinnedUserIds },
            },
            orderBy: { createdAt: "desc" },
            take: FEED_LIMIT,
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
        });

        return NextResponse.json({
            pinnedCount: pinnedRows.length,
            pinnedUsers: pinnedRows,
            posts,
        });
    } catch (error) {
        console.error("Failed to fetch pin feed:", error);
        return NextResponse.json({ error: "Failed to fetch pin feed" }, { status: 500 });
    }
}
