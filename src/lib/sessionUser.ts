import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { getTableColumns } from "@/lib/tableSchema";

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

async function findUserIdByEmailRaw(email: string): Promise<string | null> {
    const columns = await getTableColumns("User");
    if (!columns.has("id") || !columns.has("email")) {
        return null;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `
            SELECT "id"::text AS "id"
            FROM "User"
            WHERE LOWER(COALESCE("email"::text, '')) = LOWER($1)
            LIMIT 1
        `,
        email
    );

    return rows[0]?.id || null;
}

async function findUserIdByPrimaryIdRaw(userId: string): Promise<string | null> {
    const columns = await getTableColumns("User");
    if (!columns.has("id")) {
        return null;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `
            SELECT "id"::text AS "id"
            FROM "User"
            WHERE "id"::text = $1
            LIMIT 1
        `,
        userId
    );

    return rows[0]?.id || null;
}

async function findUserIdByPublicIdRaw(publicUserId: string): Promise<string | null> {
    const columns = await getTableColumns("User");
    if (!columns.has("id") || !columns.has("userId")) {
        return null;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `
            SELECT "id"::text AS "id"
            FROM "User"
            WHERE LOWER(COALESCE("userId"::text, '')) = LOWER($1)
            LIMIT 1
        `,
        publicUserId
    );

    return rows[0]?.id || null;
}

export async function resolveSessionUserId(session: Session | null): Promise<string | null> {
    const sessionUserId = normalizeString(session?.user?.id);
    const sessionPublicUserId = normalizeString((session?.user as { userId?: string } | undefined)?.userId).toLowerCase();

    if (sessionUserId) {
        try {
            const byPrimaryId = await prisma.user.findUnique({
                where: { id: sessionUserId },
                select: { id: true },
            });
            if (byPrimaryId?.id) {
                return byPrimaryId.id;
            }
        } catch {
            try {
                const rawResolvedId = await findUserIdByPrimaryIdRaw(sessionUserId);
                if (rawResolvedId) {
                    return rawResolvedId;
                }
            } catch {
                // Fall through to alternate resolution paths.
            }
        }

        try {
            const byMaybePublicId = await prisma.user.findFirst({
                where: { userId: sessionUserId.toLowerCase() },
                select: { id: true },
            });
            if (byMaybePublicId?.id) {
                return byMaybePublicId.id;
            }
        } catch (error) {
            if (!isUserIdColumnMissing(error)) {
                try {
                    const rawResolvedId = await findUserIdByPublicIdRaw(sessionUserId.toLowerCase());
                    if (rawResolvedId) {
                        return rawResolvedId;
                    }
                } catch {
                    return null;
                }
            }
        }
    }

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
                try {
                    const rawResolvedId = await findUserIdByPublicIdRaw(sessionPublicUserId);
                    if (rawResolvedId) {
                        return rawResolvedId;
                    }
                } catch {
                    return null;
                }
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
        try {
            return await findUserIdByEmailRaw(sessionEmail);
        } catch {
            return null;
        }
    }
}
