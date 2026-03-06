import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withPinnedUserTable } from "@/lib/pinnedUsers";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { tryEnsureProfileAndPostSchema } from "@/lib/schemaCompat";

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

function isSchemaCompatibilityError(error: unknown): boolean {
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

async function fetchPinnedRows(ownerId: string) {
    return withPinnedUserTable(() =>
        prisma.pinnedUser.findMany({
            where: { ownerId },
            orderBy: { createdAt: "desc" },
            select: {
                pinnedUserId: true,
                createdAt: true,
            },
        })
    );
}

async function fetchUsersByIds(userIds: string[]) {
    if (userIds.length === 0) return [] as Array<{
        id: string;
        userId?: string | null;
        name: string | null;
        email: string | null;
        image: string | null;
    }>;

    try {
        return await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: USER_PUBLIC_SELECT_WITH_USER_ID,
        });
    } catch (error) {
        if (!isSchemaCompatibilityError(error)) {
            throw error;
        }
    }

    return prisma.user.findMany({
        where: { id: { in: userIds } },
        select: USER_PUBLIC_SELECT_LEGACY,
    });
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
        if (!isSchemaCompatibilityError(error)) {
            throw error;
        }
    }

    try {
        return await prisma.post.findMany({
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
    } catch (error) {
        if (!isSchemaCompatibilityError(error)) {
            throw error;
        }
    }

    const minimalPosts = await prisma.post.findMany({
        where: {
            authorId: { in: pinnedUserIds },
        },
        orderBy: { createdAt: "desc" },
        take: FEED_LIMIT,
        select: {
            id: true,
            title: true,
            content: true,
            createdAt: true,
            authorId: true,
            author: {
                select: USER_PUBLIC_SELECT_LEGACY,
            },
        },
    });

    return minimalPosts.map((post) => ({
        ...post,
        excerpt: "",
        headerImage: null,
        tags: [] as string[],
        published: true,
        pinned: false,
        updatedAt: post.createdAt,
    }));
}

export async function GET(req: Request) {
    const session = await auth(req as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    const ownerId = await resolveSessionUserId(session);
    if (!ownerId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await tryEnsureProfileAndPostSchema();
        const pinnedRows = await fetchPinnedRows(ownerId);

        const pinnedUserIds = pinnedRows.map((row) => row.pinnedUserId);
        if (pinnedUserIds.length === 0) {
            return NextResponse.json({ pinnedCount: 0, pinnedUsers: [], posts: [] });
        }

        const users = await fetchUsersByIds([...new Set(pinnedUserIds)]);
        const userMap = new Map(users.map((user) => [user.id, user]));

        const normalizedPinnedRows = pinnedRows
            .map((row) => {
                const pinnedUser = userMap.get(row.pinnedUserId);
                if (!pinnedUser) return null;
                return {
                    pinnedUserId: row.pinnedUserId,
                    createdAt: row.createdAt,
                    pinnedUser,
                };
            })
            .filter((row): row is NonNullable<typeof row> => !!row);

        const normalizedPinnedUserIds = normalizedPinnedRows.map((row) => row.pinnedUserId);
        if (normalizedPinnedUserIds.length === 0) {
            return NextResponse.json({ pinnedCount: 0, pinnedUsers: [], posts: [] });
        }

        const posts = await fetchPinnedPosts(normalizedPinnedUserIds);

        return NextResponse.json({
            pinnedCount: normalizedPinnedRows.length,
            pinnedUsers: normalizedPinnedRows,
            posts,
        });
    } catch (error) {
        if (isSchemaCompatibilityError(error)) {
            return NextResponse.json({ pinnedCount: 0, pinnedUsers: [], posts: [] });
        }
        console.error("Failed to fetch pin feed:", error);
        return NextResponse.json({ error: "Failed to fetch pin feed" }, { status: 500 });
    }
}
