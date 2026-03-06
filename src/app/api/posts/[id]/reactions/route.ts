import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSessionUserId } from "@/lib/sessionUser";
import {
    REACTION_TYPES,
    ReactionType,
    isReactionType,
    withPostReactionTable,
} from "@/lib/postReactions";

type Counts = Record<ReactionType, number>;

function buildEmptyCounts(): Counts {
    return {
        GOOD: 0,
        SURPRISED: 0,
        SMIRK: 0,
        FIRE: 0,
        ROCKET: 0,
    };
}

async function getReactionPayload(postId: string, currentUserId?: string | null) {
    const [grouped, myRows] = await Promise.all([
        withPostReactionTable(() =>
            prisma.postReaction.groupBy({
                by: ["reaction"],
                where: { postId },
                _count: { _all: true },
            })
        ),
        currentUserId
            ? withPostReactionTable(() =>
                  prisma.postReaction.findMany({
                      where: { postId, userId: currentUserId },
                      orderBy: { createdAt: "desc" },
                      take: 1,
                      select: { reaction: true },
                  })
              )
            : Promise.resolve([] as Array<{ reaction: string }>),
    ]);

    const counts = buildEmptyCounts();
    for (const row of grouped) {
        if (isReactionType(row.reaction)) {
            counts[row.reaction] = row._count._all;
        }
    }

    const myReactionRaw = myRows[0]?.reaction;
    const myReaction = myReactionRaw && isReactionType(myReactionRaw) ? myReactionRaw : null;

    return { counts, myReaction };
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth(request as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    const currentUserId = (await resolveSessionUserId(session as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */) ?? null;
    const { id: postId } = await params;

    try {
        const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
        if (!post) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        const payload = await getReactionPayload(postId, currentUserId);
        return NextResponse.json(payload);
    } catch (error) {
        console.error("Failed to fetch reactions:", error);
        return NextResponse.json({ counts: buildEmptyCounts(), myReaction: null });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth(request as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    const currentUserId = await resolveSessionUserId(session as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    if (!currentUserId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: postId } = await params;

    try {
        const body = await request.json();
        const reactionRaw = typeof body.reaction === "string" ? body.reaction.trim().toUpperCase() : "";
        if (!isReactionType(reactionRaw)) {
            return NextResponse.json(
                { error: `Invalid reaction. Allowed: ${REACTION_TYPES.join(", ")}` },
                { status: 400 }
            );
        }

        const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
        if (!post) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        await withPostReactionTable(() =>
            prisma.$transaction(async (tx) => {
                const existing = await tx.postReaction.findFirst({
                    where: { postId, userId: currentUserId },
                    orderBy: { createdAt: "desc" },
                    select: { id: true, reaction: true },
                });

                if (existing?.reaction === reactionRaw) {
                    await tx.postReaction.delete({ where: { id: existing.id } });
                    return;
                }

                await tx.postReaction.deleteMany({ where: { postId, userId: currentUserId } });
                await tx.postReaction.create({
                    data: {
                        postId,
                        userId: currentUserId,
                        reaction: reactionRaw,
                    },
                });
            })
        );

        const payload = await getReactionPayload(postId, currentUserId);
        return NextResponse.json(payload, { status: 201 });
    } catch (error) {
        console.error("Failed to post reaction:", error);
        return NextResponse.json({ error: "Failed to post reaction" }, { status: 500 });
    }
}
