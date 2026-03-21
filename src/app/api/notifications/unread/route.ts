import { NextRequest, NextResponse } from "next/server";
import { DirectMessageContext, PullRequestStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isTransientDatabaseError } from "@/lib/prismaErrors";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { invalidateReadCachePrefix, readCacheKeys, readThroughCache } from "@/lib/readCache";
import { parseUserPreferences, serializeUserPreferences } from "@/lib/userPreferences";

const UNREAD_CACHE_TTL_MS = 3 * 1000;

function parseSince(raw: string | null): Date {
    if (!raw) return new Date(0);
    const since = new Date(raw);
    if (Number.isNaN(since.getTime())) return new Date(0);
    return since;
}

async function loadStoredSeenAt(userId: string): Promise<string | null> {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { links: true },
        });

        return parseUserPreferences(user?.links).dmLastSeenAt;
    } catch {
        return null;
    }
}

function resolveUnreadSince(explicitSinceRaw: string | null, storedSinceRaw: string | null): Date {
    const explicitSince = parseSince(explicitSinceRaw);
    const storedSince = parseSince(storedSinceRaw);

    return explicitSince.getTime() > storedSince.getTime() ? explicitSince : storedSince;
}

export async function GET(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const storedSinceRaw = await loadStoredSeenAt(userId);
    const since = resolveUnreadSince(request.nextUrl.searchParams.get("since"), storedSinceRaw);

    try {
        const payload = await readThroughCache(
            readCacheKeys.unread(userId, since.toISOString()),
            UNREAD_CACHE_TTL_MS,
            async () => {
                const dmCount = await prisma.directMessage
                    .count({
                        where: {
                            recipientId: userId,
                            context: DirectMessageContext.GENERAL,
                            createdAt: { gt: since },
                        },
                    })
                    .catch(() => 0);
                const prCount = await prisma.articlePullRequest
                    .count({
                        where: {
                            recipientId: userId,
                            status: PullRequestStatus.PENDING,
                            createdAt: { gt: since },
                        },
                    })
                    .catch(() => 0);

                return {
                    total: dmCount + prCount,
                    dm: dmCount,
                    pr: prCount,
                    since: since.toISOString(),
                };
            }
        );

        return NextResponse.json(payload);
    } catch (error) {
        if (isTransientDatabaseError(error)) {
            return NextResponse.json({ total: 0, dm: 0, pr: 0, since: since.toISOString() });
        }
        console.error("Failed to fetch unread notifications:", error);
        return NextResponse.json({ total: 0, dm: 0, pr: 0, since: since.toISOString() });
    }
}

export async function POST(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({} as { seenAt?: string }));
    const requestedSeenAt = parseSince(payload.seenAt || null);
    const storedSeenAt = parseSince(await loadStoredSeenAt(userId));
    const nextSeenAt =
        requestedSeenAt.getTime() > storedSeenAt.getTime() ? requestedSeenAt : storedSeenAt;

    try {
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { links: true },
        });

        if (!currentUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const preferences = parseUserPreferences(currentUser.links);
        await prisma.user.update({
            where: { id: userId },
            data: {
                links: serializeUserPreferences({
                    ...preferences,
                    dmLastSeenAt: nextSeenAt.toISOString(),
                }),
            },
        });

        invalidateReadCachePrefix("unread:");
        return NextResponse.json({ seenAt: nextSeenAt.toISOString() });
    } catch (error) {
        console.error("Failed to update unread notification state:", error);
        return NextResponse.json({ error: "Failed to update unread notification state" }, { status: 500 });
    }
}
