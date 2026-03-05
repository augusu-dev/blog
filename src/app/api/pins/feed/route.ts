import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withPinnedUserTable } from "@/lib/pinnedUsers";

const FEED_LIMIT = 120;

const USER_PUBLIC_SELECT_WITH_USER_ID = {
    id: true,
    userId: true,
    name: true,
    email: true,
    image: true,
} as const;

const USER_PUBLIC_SELECT_LEGACY = {
    id: true,
    name: true,
    email: true,
    image: true,
} as const;

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

async function fetchPinnedRows(ownerId: string) {
    try {
        const rows = await withPinnedUserTable(() =>
            prisma.pinnedUser.findMany({
                where: { ownerId },
                orderBy: { createdAt: "desc" },
                select: {
                    pinnedUserId: true,
                    createdAt: true,
                    pinnedUser: {
                        select: USER_PUBLIC_SELECT_WITH_USER_ID,
                    },
                },
            })
        );
        return rows;
    } catch (error) {
        if (!isUserIdColumnMissing(error)) {
            throw error;
        }
    }

    return withPinnedUserTable(() =>
        prisma.pinnedUser.findMany({
            where: { ownerId },
            orderBy: { createdAt: "desc" },
            select: {
                pinnedUserId: true,
                createdAt: true,
                pinnedUser: {
                    select: USER_PUBLIC_SELECT_LEGACY,
                },
            },
        })
    );
}

async function fetchPinnedPosts(pinnedUserIds: string[]) {
    try {
        const posts = await prisma.post.findMany({
            where: {
                published: true,
                authorId: { in: pinnedUserIds },
            },
            orderBy: { createdAt: "desc" },
            take: FEED_LIMIT,
            include: {
                author: {
                    select: USER_PUBLIC_SELECT_WITH_USER_ID,
                },
            },
        });
        return posts;
    } catch (error) {
        if (!isUserIdColumnMissing(error)) {
            throw error;
        }
    }

    return prisma.post.findMany({
        where: {
            published: true,
            authorId: { in: pinnedUserIds },
        },
        orderBy: { createdAt: "desc" },
        take: FEED_LIMIT,
        include: {
            author: {
                select: USER_PUBLIC_SELECT_LEGACY,
            },
        },
    });
}

export async function GET() {
    const session = await auth();
    const ownerId = session?.user?.id;
    if (!ownerId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const pinnedRows = await fetchPinnedRows(ownerId);

        const pinnedUserIds = pinnedRows.map((row) => row.pinnedUserId);
        if (pinnedUserIds.length === 0) {
            return NextResponse.json({ pinnedCount: 0, pinnedUsers: [], posts: [] });
        }

        const posts = await fetchPinnedPosts(pinnedUserIds);

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
