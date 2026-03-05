import type { Session } from "next-auth";
import { prisma } from "@/lib/db";

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export async function resolveSessionUserId(session: Session | null): Promise<string | null> {
    const sessionUserId = normalizeString(session?.user?.id);
    if (sessionUserId) {
        return sessionUserId;
    }

    const sessionEmail = normalizeString(session?.user?.email).toLowerCase();
    if (!sessionEmail) {
        return null;
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: sessionEmail },
            select: { id: true },
        });
        return user?.id || null;
    } catch {
        return null;
    }
}

