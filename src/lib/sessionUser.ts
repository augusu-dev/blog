import type { Session } from "next-auth";
import { prisma } from "@/lib/db";

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isUserIdColumnMissing(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
        const code = String((error as { code?: unknown }).code || "");
        if (code === "P2022") {
            const column = String((error as { meta?: { column?: unknown } }).meta?.column || "");
            return !column || column.includes("userId");
        }
    }
    if (error instanceof Error) {
        return /userId|unknown arg `userId`|column .*userId/i.test(error.message);
    }
    return false;
}

export async function resolveSessionUserId(session: Session | null): Promise<string | null> {
    const sessionUserId = normalizeString(session?.user?.id);
    if (sessionUserId) {
        return sessionUserId;
    }

    const sessionPublicUserId = normalizeString((session?.user as { userId?: string } | undefined)?.userId).toLowerCase();
    if (sessionPublicUserId) {
        try {
            const byPublicId = await prisma.user.findFirst({
                where: { userId: sessionPublicUserId },
                select: { id: true },
            });
            if (byPublicId?.id) {
                return byPublicId.id;
            }
        } catch (error) {
            if (!isUserIdColumnMissing(error)) {
                return null;
            }
        }
    }

    const sessionEmail = normalizeString(session?.user?.email);
    if (!sessionEmail) {
        return null;
    }

    try {
        const user = await prisma.user.findFirst({
            where: { email: { equals: sessionEmail, mode: "insensitive" } },
            select: { id: true },
        });
        return user?.id || null;
    } catch {
        return null;
    }
}
