import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DirectMessageContext, DirectMessageSetting } from "@prisma/client";

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mode = request.nextUrl.searchParams.get("mode") === "sent" ? "sent" : "inbox";

    try {
        if (mode === "sent") {
            const messages = await prisma.directMessage.findMany({
                where: {
                    senderId: userId,
                    context: DirectMessageContext.GENERAL,
                },
                orderBy: { createdAt: "desc" },
                include: {
                    recipient: { select: { id: true, name: true, email: true } },
                },
            });
            return NextResponse.json({ mode, messages });
        }

        const messages = await prisma.directMessage.findMany({
            where: {
                recipientId: userId,
                context: DirectMessageContext.GENERAL,
            },
            orderBy: { createdAt: "desc" },
            include: {
                sender: { select: { id: true, name: true, email: true } },
            },
        });

        return NextResponse.json({ mode, messages });
    } catch (error) {
        console.error("Failed to fetch direct messages:", error);
        return NextResponse.json({ error: "Failed to fetch direct messages" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const recipientId = normalizeString(body.recipientId);
        const content = normalizeString(body.content);

        if (!recipientId) {
            return NextResponse.json({ error: "recipientId is required" }, { status: 400 });
        }

        if (recipientId === userId) {
            return NextResponse.json({ error: "Cannot send a message to yourself" }, { status: 400 });
        }

        if (!content || content.length > 1000) {
            return NextResponse.json(
                { error: "Message must be 1-1000 characters." },
                { status: 400 }
            );
        }

        const recipient = await prisma.user.findUnique({
            where: { id: recipientId },
            select: { id: true, dmSetting: true },
        });

        if (!recipient) {
            return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
        }

        if (recipient.dmSetting !== DirectMessageSetting.OPEN) {
            return NextResponse.json(
                { error: "This user is not accepting general direct messages." },
                { status: 403 }
            );
        }

        const message = await prisma.directMessage.create({
            data: {
                senderId: userId,
                recipientId,
                content,
                context: DirectMessageContext.GENERAL,
            },
            include: {
                recipient: { select: { id: true, name: true, email: true } },
            },
        });

        return NextResponse.json(message, { status: 201 });
    } catch (error) {
        console.error("Failed to send direct message:", error);
        return NextResponse.json({ error: "Failed to send direct message" }, { status: 500 });
    }
}