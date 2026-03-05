import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withPinnedUserTable } from "@/lib/pinnedUsers";
import { resolveSessionUserId } from "@/lib/sessionUser";

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
    const rows = await withPinnedUserTable(() =>
        prisma.pinnedUser.findMany({
            where: { ownerId },
            orderBy: { createdAt: "desc" },
            select: { pinnedUserId: true, createdAt: true },
        })
    );

    const pinnedUserIds = [...new Set(rows.map((row) => row.pinnedUserId))];
    if (pinnedUserIds.length === 0) return [];

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

    const userMap = new Map(users.map((user) => [user.id, user]));
    return rows
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

export async function GET(request: NextRequest) {
    const session = await auth();
    const ownerId = await resolveSessionUserId(session);
    if (!ownerId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targetRef = normalizeString(request.nextUrl.searchParams.get("userId"));

    try {
        if (targetRef) {
            const targetUserId = await resolveTargetUserId(targetRef);
            if (!targetUserId) {
                return NextResponse.json({ pinned: false, userId: targetRef });
            }
            const existing = await withPinnedUserTable(() =>
                prisma.pinnedUser.findFirst({
                    where: { ownerId, pinnedUserId: targetUserId },
                    select: { id: true },
                })
            );
            return NextResponse.json({ pinned: !!existing, userId: targetUserId });
        }

        const pinnedUsers = await fetchPinnedUsers(ownerId);
        return NextResponse.json({
            count: pinnedUsers.length,
            users: pinnedUsers,
        });
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
        const pinnedUserId = await resolveTargetUserId(targetRef);
        if (!pinnedUserId) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        if (pinnedUserId === ownerId) {
            return NextResponse.json({ error: "Cannot pin yourself" }, { status: 400 });
        }

        const existing = await withPinnedUserTable(() =>
            prisma.pinnedUser.findFirst({
                where: { ownerId, pinnedUserId },
                select: { id: true },
            })
        );

        if (existing) {
            await withPinnedUserTable(() =>
                prisma.pinnedUser.delete({
                    where: { id: existing.id },
                })
            );
            return NextResponse.json({ pinned: false, pinnedUserId });
        }

        await withPinnedUserTable(() =>
            prisma.pinnedUser.create({
                data: { ownerId, pinnedUserId },
            })
        );

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
        const existing = await withPinnedUserTable(() =>
            prisma.pinnedUser.findFirst({
                where: { ownerId, pinnedUserId },
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
        return NextResponse.json({ ok: true, pinned: false, pinnedUserId });
    } catch (error) {
        console.error("Failed to unpin user:", error);
        return NextResponse.json({ error: "Failed to unpin user" }, { status: 500 });
    }
}
