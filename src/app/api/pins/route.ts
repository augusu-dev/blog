import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withPinnedUserTable } from "@/lib/pinnedUsers";
import { getUserProfileByRefFallback } from "@/lib/publicContentFallback";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { invalidateReadCachePrefix, readCacheKeys, readThroughCache } from "@/lib/readCache";

const PINS_STATE_CACHE_TTL_MS = 15 * 1000;

const PINNED_USER_PUBLIC_SELECT_WITH_USER_ID = {
    id: true,
    userId: true,
    name: true,
    email: true,
    image: true,
} as const;

const PINNED_USER_PUBLIC_SELECT_LEGACY = {
    id: true,
    name: true,
    email: true,
    image: true,
} as const;

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function normalizeRef(value: unknown): string {
    return normalizeString(value).toLowerCase();
}

function uniqueRefs(...values: Array<string | null | undefined>): string[] {
    return [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))];
}

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

function isPinnedUserUnavailableError(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
        const code = String((error as { code?: unknown }).code || "");
        if (code === "P2021" || code === "P2022") return true;
    }
    if (error instanceof Error) {
        return /PinnedUser|relation .*PinnedUser.* does not exist|column .* does not exist|permission denied|must be owner/i.test(
            error.message
        );
    }
    return false;
}

async function resolveTargetUserId(rawRef: string): Promise<string | null> {
    const userRef = normalizeString(rawRef);
    if (!userRef) return null;

    try {
        const matched = await prisma.user.findFirst({
            where: {
                OR: [
                    { id: userRef },
                    { userId: userRef.toLowerCase() },
                    { name: { equals: userRef, mode: "insensitive" } },
                ],
            },
            select: { id: true },
        });
        return matched?.id || null;
    } catch (error) {
        if (!isUserIdColumnMissing(error)) {
            throw error;
        }
    }

    const matched = await prisma.user.findFirst({
        where: {
            OR: [{ id: userRef }, { name: { equals: userRef, mode: "insensitive" } }],
        },
        select: { id: true },
    });
    return matched?.id || null;
}

async function fetchPinnedUsers(ownerId: string) {
    const rows = await prisma.pinnedUser
        .findMany({
            where: { ownerId },
            orderBy: { createdAt: "desc" },
            select: { pinnedUserId: true, createdAt: true },
        })
        .catch((error) => {
            if (isPinnedUserUnavailableError(error)) {
                return [];
            }
            throw error;
        });

    const pinnedUserIds = [...new Set(rows.map((row) => row.pinnedUserId))];
    if (pinnedUserIds.length === 0) return [];

    const userById = new Map<
        string,
        {
            id: string;
            userId?: string | null;
            name: string | null;
            email: string | null;
            image: string | null;
        }
    >();
    const userByRef = new Map<
        string,
        {
            id: string;
            userId?: string | null;
            name: string | null;
            email: string | null;
            image: string | null;
        }
    >();

    const registerUser = (user: {
        id: string;
        userId?: string | null;
        name: string | null;
        email: string | null;
        image: string | null;
    }) => {
        userById.set(user.id, user);
        userByRef.set(normalizeRef(user.id), user);
        if (user.userId) {
            userByRef.set(normalizeRef(user.userId), user);
        }
    };

    let users:
        | Array<{
              id: string;
              userId?: string | null;
              name: string | null;
              email: string | null;
              image: string | null;
          }>
        | null = null;

    try {
        users = await prisma.user.findMany({
            where: { id: { in: pinnedUserIds } },
            select: PINNED_USER_PUBLIC_SELECT_WITH_USER_ID,
        });
    } catch (error) {
        if (!isUserIdColumnMissing(error)) {
            throw error;
        }
    }

    if (!users) {
        users = await prisma.user.findMany({
            where: { id: { in: pinnedUserIds } },
            select: PINNED_USER_PUBLIC_SELECT_LEGACY,
        });
    }

    for (const user of users) {
        registerUser(user);
    }

    const unresolvedRefs = pinnedUserIds.filter((ref) => !userByRef.has(normalizeRef(ref)));
    if (unresolvedRefs.length > 0) {
        const profiles = await Promise.all(
            unresolvedRefs.map((ref) =>
                getUserProfileByRefFallback(ref).catch(() => null)
            )
        );

        for (const profile of profiles) {
            if (!profile) continue;
            registerUser({
                id: profile.id,
                userId: profile.userId ?? null,
                name: profile.name,
                email: profile.email,
                image: profile.image,
            });
        }
    }

    return rows
        .map((row) => {
            const pinnedUser = userByRef.get(normalizeRef(row.pinnedUserId));
            if (!pinnedUser) return null;
            return {
                pinnedUserId: pinnedUser.id,
                createdAt: row.createdAt,
                pinnedUser,
            };
        })
        .filter((row): row is NonNullable<typeof row> => !!row);
}

async function resolvePinnedUserIdForDelete(rawRef: string): Promise<string | null> {
    const normalized = normalizeString(rawRef);
    if (!normalized) return null;

    const pinnedById = await withPinnedUserTable(() =>
        prisma.pinnedUser.findFirst({
            where: { id: normalized },
            select: { pinnedUserId: true },
        })
    );
    if (pinnedById) return pinnedById.pinnedUserId;

    return resolveTargetUserId(normalized);
}

async function resolvePinnedTargetRefs(rawRef: string): Promise<{
    normalizedRef: string;
    targetUserId: string | null;
    candidateRefs: string[];
}> {
    const normalizedRef = normalizeString(rawRef);
    if (!normalizedRef) {
        return { normalizedRef: "", targetUserId: null, candidateRefs: [] };
    }

    const targetUserId = await resolveTargetUserId(normalizedRef);
    return {
        normalizedRef,
        targetUserId,
        candidateRefs: uniqueRefs(normalizedRef, targetUserId),
    };
}

export async function GET(request: NextRequest) {
    const session = await auth();
    const ownerId = await resolveSessionUserId(session);
    if (!ownerId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targetRef = normalizeString(request.nextUrl.searchParams.get("userId"));

    try {
        if (targetRef) {
            const payload = await readThroughCache(
                readCacheKeys.pinsState(ownerId, targetRef),
                PINS_STATE_CACHE_TTL_MS,
                async () => {
                    const { targetUserId, candidateRefs } = await resolvePinnedTargetRefs(targetRef);
                    if (!targetUserId) {
                        return { pinned: false, userId: targetRef };
                    }
                    const existing = await prisma.pinnedUser
                        .findFirst({
                            where: { ownerId, pinnedUserId: { in: candidateRefs } },
                            select: { id: true, pinnedUserId: true },
                        })
                        .catch((error) => {
                            if (isPinnedUserUnavailableError(error)) {
                                return null;
                            }
                            throw error;
                        });
                    return {
                        pinned: !!existing,
                        userId: targetUserId,
                        pinnedUserId: existing?.pinnedUserId || targetUserId,
                    };
                }
            );

            return NextResponse.json(payload);
        }

        const payload = await readThroughCache(readCacheKeys.pinsList(ownerId), PINS_STATE_CACHE_TTL_MS, async () => {
            const pinnedUsers = await fetchPinnedUsers(ownerId);
            return {
                count: pinnedUsers.length,
                users: pinnedUsers,
            };
        });

        return NextResponse.json(payload);
    } catch (error) {
        console.error("Failed to fetch pinned users:", error);
        return NextResponse.json({ error: "Failed to fetch pinned users" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await auth();
    const ownerId = await resolveSessionUserId(session);
    if (!ownerId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const targetRef = normalizeString(body.pinnedUserId || body.userId || body.targetUserId);
        const { targetUserId, candidateRefs } = await resolvePinnedTargetRefs(targetRef);
        const pinnedUserId = targetUserId;
        if (!pinnedUserId) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        if (pinnedUserId === ownerId) {
            return NextResponse.json({ error: "Cannot pin yourself" }, { status: 400 });
        }

        const existing = await withPinnedUserTable(() =>
            prisma.pinnedUser.findFirst({
                where: { ownerId, pinnedUserId: { in: candidateRefs } },
                select: { id: true },
            })
        );

        if (existing) {
            await withPinnedUserTable(() =>
                prisma.pinnedUser.delete({
                    where: { id: existing.id },
                })
            );
            invalidateReadCachePrefix("pins-feed:");
            invalidateReadCachePrefix("pins-state:");
            invalidateReadCachePrefix("pins-list:");
            return NextResponse.json({ pinned: false, pinnedUserId });
        }

        await withPinnedUserTable(() =>
            prisma.pinnedUser.create({
                data: { ownerId, pinnedUserId },
            })
        );

        invalidateReadCachePrefix("pins-feed:");
        invalidateReadCachePrefix("pins-state:");
        invalidateReadCachePrefix("pins-list:");

        return NextResponse.json({ pinned: true, pinnedUserId }, { status: 201 });
    } catch (error) {
        console.error("Failed to toggle pin:", error);
        return NextResponse.json({ error: "Failed to toggle pin" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const session = await auth();
    const ownerId = await resolveSessionUserId(session);
    if (!ownerId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targetRef = normalizeString(request.nextUrl.searchParams.get("userId"));
    const pinnedUserId = await resolvePinnedUserIdForDelete(targetRef);
    if (!pinnedUserId) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    try {
        const candidateRefs = uniqueRefs(targetRef, pinnedUserId);
        const existing = await withPinnedUserTable(() =>
            prisma.pinnedUser.findFirst({
                where: { ownerId, pinnedUserId: { in: candidateRefs } },
                select: { id: true },
            })
        );
        if (!existing) {
            return NextResponse.json({ ok: true, pinned: false, pinnedUserId });
        }

        await withPinnedUserTable(() =>
            prisma.pinnedUser.delete({
                where: { id: existing.id },
            })
        );
        invalidateReadCachePrefix("pins-feed:");
        invalidateReadCachePrefix("pins-state:");
        invalidateReadCachePrefix("pins-list:");
        return NextResponse.json({ ok: true, pinned: false, pinnedUserId });
    } catch (error) {
        console.error("Failed to unpin user:", error);
        return NextResponse.json({ error: "Failed to unpin user" }, { status: 500 });
    }
}
