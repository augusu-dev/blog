import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withDirectMessageTable } from "@/lib/directMessages";
import { resolveSessionUserId } from "@/lib/sessionUser";

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    const currentUserId = await resolveSessionUserId(session);
    if (!currentUserId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
        return NextResponse.json({ error: "Message id is required" }, { status: 400 });
    }

    try {
        const message = await withDirectMessageTable(() =>
            prisma.directMessage.findUnique({
                where: { id },
                select: { id: true, senderId: true },
            })
        );

        if (!message) {
            return NextResponse.json({ error: "Message not found" }, { status: 404 });
        }

        if (message.senderId !== currentUserId) {
            return NextResponse.json({ error: "Only the sender can delete this message" }, { status: 403 });
        }

        await withDirectMessageTable(() =>
            prisma.directMessage.delete({
                where: { id: message.id },
            })
        );

        return NextResponse.json({ ok: true, id: message.id });
    } catch (error) {
        console.error("Failed to delete direct message:", error);
        return NextResponse.json({ error: "Failed to delete direct message" }, { status: 500 });
    }
}
