import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
    withDirectMessageGoodTable,
    withDirectMessageTable,
} from "@/lib/directMessages";
import { resolveSessionUserId } from "@/lib/sessionUser";

async function getGoodState(messageId: string, userId: string) {
    const [goodCount, mine] = await Promise.all([
        withDirectMessageGoodTable(() =>
            prisma.directMessageGood.count({
                where: { messageId },
            })
        ),
        withDirectMessageGoodTable(() =>
            prisma.directMessageGood.findUnique({
                where: {
                    messageId_userId: {
                        messageId,
                        userId,
                    },
                },
                select: { id: true },
            })
        ),
    ]);

    return {
        goodCount,
        likedByMe: !!mine,
    };
}

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    const currentUserId = await resolveSessionUserId(session);
    if (!currentUserId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: messageId } = await params;
    if (!messageId) {
        return NextResponse.json({ error: "Message id is required" }, { status: 400 });
    }

    try {
        const message = await withDirectMessageTable(() =>
            prisma.directMessage.findUnique({
                where: { id: messageId },
                select: {
                    id: true,
                    senderId: true,
                    recipientId: true,
                },
            })
        );

        if (!message) {
            return NextResponse.json({ error: "Message not found" }, { status: 404 });
        }

        if (message.senderId === currentUserId) {
            return NextResponse.json(
                { error: "You can only react to the other user's message." },
                { status: 400 }
            );
        }

        if (message.recipientId !== currentUserId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await withDirectMessageGoodTable(() =>
            prisma.$transaction(async (tx) => {
                const existing = await tx.directMessageGood.findUnique({
                    where: {
                        messageId_userId: {
                            messageId,
                            userId: currentUserId,
                        },
                    },
                    select: { id: true },
                });

                if (existing) {
                    await tx.directMessageGood.delete({
                        where: { id: existing.id },
                    });
                    return;
                }

                await tx.directMessageGood.create({
                    data: {
                        messageId,
                        userId: currentUserId,
                    },
                });
            })
        );

        return NextResponse.json({
            messageId,
            ...(await getGoodState(messageId, currentUserId)),
        });
    } catch (error) {
        console.error("Failed to toggle direct message good:", error);
        return NextResponse.json(
            { error: "Failed to toggle direct message good" },
            { status: 500 }
        );
    }
}
