import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withPinnedUserTable } from "@/lib/pinnedUsers";

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

async function resolveTargetUserId(rawRef: string): Promise<string | null> {
    const userRef = normalizeString(rawRef);
    if (!userRef) return null;

    try {
        const user = await prisma.user.findFirst({
            where: {
                OR: [{ id: userRef }, { userId: userRef.toLowerCase() }],
            },
            select: { id: true },
        });
        return user?.id || null;
    } catch {
        const user = await prisma.user.findUnique({
            where: { id: userRef },
            select: { id: true },
        });
        return user?.id || null;
    }
}

export async function GET(request: NextRequest) {
    const session = await auth();
    const ownerId = session?.user?.id;
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

        const pinnedUsers = await withPinnedUserTable(() =>
            prisma.pinnedUser.findMany({
                where: { ownerId },
                orderBy: { createdAt: "desc" },
                include: {
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
    const ownerId = session?.user?.id;
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
    const ownerId = session?.user?.id;
    if (!ownerId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targetRef = normalizeString(request.nextUrl.searchParams.get("userId"));
    const pinnedUserId = await resolveTargetUserId(targetRef);
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
