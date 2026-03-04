import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DirectMessageContext } from "@prisma/client";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
const DEFAULT_DM_SETTING: DmSetting = "OPEN";

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function parseDmSetting(value: unknown): DmSetting | undefined {
    if (value === "OPEN" || value === "PR_ONLY" || value === "CLOSED") {
        return value;
    }
    return undefined;
}

function unpackDmSettingFromLinks(raw: string | null | undefined): DmSetting {
    if (!raw) return DEFAULT_DM_SETTING;

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const candidate = parsed as { dmSetting?: unknown };
            return parseDmSetting(candidate.dmSetting) || DEFAULT_DM_SETTING;
        }
    } catch {
        return DEFAULT_DM_SETTING;
    }

    return DEFAULT_DM_SETTING;
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
            select: { id: true, links: true },
        });

        if (!recipient) {
            return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
        }

        const recipientDmSetting = unpackDmSettingFromLinks(recipient.links);
        if (recipientDmSetting !== "OPEN") {
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