import { NextRequest, NextResponse } from "next/server";
import { DirectMessageContext, PullRequestStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { readCacheKeys, readThroughCache } from "@/lib/readCache";

const UNREAD_CACHE_TTL_MS = 3 * 1000;

function parseSince(raw: string | null): Date {
    if (!raw) return new Date(0);
    const since = new Date(raw);
    if (Number.isNaN(since.getTime())) return new Date(0);
    return since;
}

export async function GET(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const since = parseSince(request.nextUrl.searchParams.get("since"));

    try {
        const payload = await readThroughCache(
            readCacheKeys.unread(userId, since.toISOString()),
            UNREAD_CACHE_TTL_MS,
            async () => {
                const [dmCount, prCount] = await Promise.all([
                    prisma.directMessage
                        .count({
                            where: {
                                recipientId: userId,
                                context: DirectMessageContext.GENERAL,
                                createdAt: { gt: since },
                            },
                        })
                        .catch(() => 0),
                    prisma.articlePullRequest.count({
                        where: {
                            recipientId: userId,
                            status: PullRequestStatus.PENDING,
                            createdAt: { gt: since },
                        },
                    }).catch(() => 0),
                ]);

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
        console.error("Failed to fetch unread notifications:", error);
        return NextResponse.json({ total: 0, dm: 0, pr: 0, since: since.toISOString() });
    }
}
