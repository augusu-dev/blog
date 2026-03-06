import { NextRequest, NextResponse } from "next/server";
import { DirectMessageContext } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withDirectMessageTable } from "@/lib/directMessages";
import { resolveSessionUserId } from "@/lib/sessionUser";

function parseSince(raw: string | null): Date {
    if (!raw) return new Date(0);
    const since = new Date(raw);
    if (Number.isNaN(since.getTime())) return new Date(0);
    return since;
}

export async function GET(request: NextRequest) {
    const session = await auth(request as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    const userId = await resolveSessionUserId(session as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const since = parseSince(request.nextUrl.searchParams.get("since"));

    try {
        const [dmCount, prCount] = await Promise.all([
            withDirectMessageTable(() =>
                prisma.directMessage.count({
                    where: {
                        recipientId: userId,
                        context: DirectMessageContext.GENERAL,
                        createdAt: { gt: since },
                    },
                })
            ),
            prisma.articlePullRequest.count({
                where: {
                    recipientId: userId,
                    createdAt: { gt: since },
                },
            }),
        ]);

        return NextResponse.json({
            total: dmCount + prCount,
            dm: dmCount,
            pr: prCount,
            since: since.toISOString(),
        });
    } catch (error) {
        console.error("Failed to fetch unread notifications:", error);
        return NextResponse.json({ total: 0, dm: 0, pr: 0, since: since.toISOString() });
    }
}
