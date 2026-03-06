import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withPinnedUserTable } from "@/lib/pinnedUsers";
import { getPostsByAuthorFallback, getUserProfileByRefFallback } from "@/lib/publicContentFallback";
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

type PublicUser = {
    id: string;
    userId?: string | null;
    name: string | null;
    email: string | null;
    image: string | null;
};

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

function normalizeRef(value: string | null | undefined): string {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function registerUserRef(map: Map<string, PublicUser>, user: PublicUser) {
    const idRef = normalizeRef(user.id);
    const publicRef = normalizeRef(user.userId);

    if (idRef) {
        map.set(idRef, user);
    }
    if (publicRef) {
        map.set(publicRef, user);
    }
}

async function fetchUsersByRefs(userRefs: string[]) {
    const refs = [...new Set(userRefs.map((ref) => ref.trim()).filter(Boolean))];
    if (refs.length === 0) return [] as PublicUser[];

    const userById = new Map<string, PublicUser>();
    const userByRef = new Map<string, PublicUser>();

    try {
        const users = await prisma.user.findMany({
            where: {
                OR: [
                    { id: { in: refs } },
                    { userId: { in: refs.map((ref) => ref.toLowerCase()) } },
                ],
            },
            select: USER_PUBLIC_SELECT_WITH_USER_ID,
        });
        for (const user of users) {
            userById.set(user.id, user);
            registerUserRef(userByRef, user);
        }
    } catch (error) {
        if (!isSchemaCompatibilityError(error)) {
            throw error;
        }

        const legacyUsers = await prisma.user.findMany({
            where: { id: { in: refs } },
            select: USER_PUBLIC_SELECT_LEGACY,
        });
        for (const user of legacyUsers) {
            const normalizedUser: PublicUser = { ...user, userId: null };
            userById.set(normalizedUser.id, normalizedUser);
            registerUserRef(userByRef, normalizedUser);
        }
    }

    const unresolvedRefs = refs.filter((ref) => !userByRef.has(normalizeRef(ref)));
    if (unresolvedRefs.length > 0) {
        const profiles = await Promise.all(
            unresolvedRefs.map((ref) =>
                getUserProfileByRefFallback(ref).catch(() => null)
            )
        );

        for (const profile of profiles) {
            if (!profile) continue;
            const user: PublicUser = {
                id: profile.id,
                userId: profile.userId ?? null,
                name: profile.name,
                email: profile.email,
                image: profile.image,
            };
            userById.set(user.id, user);
            registerUserRef(userByRef, user);
        }
    }

    return Array.from(userById.values());
}

async function fetchPinnedPosts(pinnedUsers: PublicUser[]) {
    const authorRefs = [...new Set(
        pinnedUsers.flatMap((user) => [user.id, user.userId].filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0))
    )];
    if (authorRefs.length === 0) {
        return [];
    }

    const posts = await getPostsByAuthorFallback(authorRefs, {
        publishedOnly: true,
        limit: FEED_LIMIT,
    });
    const authorMap = new Map<string, PublicUser>();

    for (const user of pinnedUsers) {
        registerUserRef(authorMap, user);
    }

    return posts
        .map((post) => {
            const author = authorMap.get(normalizeRef(post.authorId));
            if (!author) return null;
            return {
                ...post,
                authorId: author.id,
                author,
            };
        })
        .filter((post): post is NonNullable<typeof post> => !!post)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
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

        const pinnedUserRefs = pinnedRows.map((row) => row.pinnedUserId);
        if (pinnedUserRefs.length === 0) {
            return NextResponse.json({ pinnedCount: 0, pinnedUsers: [], posts: [] });
        }

        const users = await fetchUsersByRefs(pinnedUserRefs);
        const userMap = new Map<string, PublicUser>();
        for (const user of users) {
            registerUserRef(userMap, user);
        }

        const normalizedPinnedRows = pinnedRows
            .map((row) => {
                const pinnedUser = userMap.get(normalizeRef(row.pinnedUserId));
                if (!pinnedUser) return null;
                return {
                    pinnedUserId: pinnedUser.id,
                    createdAt: row.createdAt,
                    pinnedUser,
                };
            })
            .filter((row): row is NonNullable<typeof row> => !!row);

        if (normalizedPinnedRows.length === 0) {
            return NextResponse.json({ pinnedCount: 0, pinnedUsers: [], posts: [] });
        }

        const posts = await fetchPinnedPosts(normalizedPinnedRows.map((row) => row.pinnedUser));

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
