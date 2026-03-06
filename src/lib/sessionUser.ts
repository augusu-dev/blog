import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { getTableColumns } from "@/lib/tableSchema";

const SESSION_USER_CACHE_TTL_MS = 5 * 60 * 1000;
const sessionUserIdCache = new Map<string, { value: string; expiresAt: number }>();

function normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function buildSessionCacheKeys(session: Session | null): string[] {
    const keys = new Set<string>();
    const primaryId = normalizeString(session?.user?.id);
    const publicUserId = normalizeString((session?.user as { userId?: string } | undefined)?.userId).toLowerCase();
    const email = normalizeString(session?.user?.email).toLowerCase();
    const name = normalizeString(session?.user?.name).toLowerCase();

    if (primaryId) keys.add(`id:${primaryId}`);
    if (publicUserId) keys.add(`public:${publicUserId}`);
    if (email) keys.add(`email:${email}`);
    if (name) keys.add(`name:${name}`);

    return [...keys];
}

function getFastSessionPrimaryId(session: Session | null): string {
    const primaryId = normalizeString(session?.user?.id);
    const publicUserId = normalizeString(
        (session?.user as { userId?: string } | undefined)?.userId
    ).toLowerCase();

    if (primaryId && publicUserId && publicUserId !== primaryId.toLowerCase()) {
        return primaryId;
    }

    return "";
}

function readCachedSessionUserId(keys: string[]): string | null {
    const now = Date.now();

    for (const key of keys) {
        const cached = sessionUserIdCache.get(key);
        if (!cached) continue;
        if (cached.expiresAt <= now) {
            sessionUserIdCache.delete(key);
            continue;
        }
        return cached.value;
    }

    return null;
}

function writeCachedSessionUserId(keys: string[], userId: string): string {
    const expiresAt = Date.now() + SESSION_USER_CACHE_TTL_MS;
    for (const key of keys) {
        sessionUserIdCache.set(key, { value: userId, expiresAt });
    }
    return userId;
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

async function findUserIdByNameRaw(name: string): Promise<string | null> {
    const columns = await getTableColumns("User");
    if (!columns.has("id") || !columns.has("name")) {
        return null;
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `
            SELECT "id"::text AS "id"
            FROM "User"
            WHERE LOWER(COALESCE("name"::text, '')) = LOWER($1)
            LIMIT 1
        `,
        name
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
    const cacheKeys = buildSessionCacheKeys(session);
    const cachedUserId = readCachedSessionUserId(cacheKeys);

    if (cachedUserId) {
        return cachedUserId;
    }

    const fastPrimaryId = getFastSessionPrimaryId(session);
    if (fastPrimaryId) {
        return writeCachedSessionUserId(cacheKeys, fastPrimaryId);
    }

    if (sessionUserId) {
        try {
            const byPrimaryId = await prisma.user.findUnique({
                where: { id: sessionUserId },
                select: { id: true },
            });
            if (byPrimaryId?.id) {
                return writeCachedSessionUserId(cacheKeys, byPrimaryId.id);
            }
        } catch {
            try {
                const rawResolvedId = await findUserIdByPrimaryIdRaw(sessionUserId);
                if (rawResolvedId) {
                    return writeCachedSessionUserId(cacheKeys, rawResolvedId);
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
                return writeCachedSessionUserId(cacheKeys, byMaybePublicId.id);
            }
        } catch (error) {
            if (!isUserIdColumnMissing(error)) {
                try {
                    const rawResolvedId = await findUserIdByPublicIdRaw(sessionUserId.toLowerCase());
                    if (rawResolvedId) {
                        return writeCachedSessionUserId(cacheKeys, rawResolvedId);
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
                return writeCachedSessionUserId(cacheKeys, byPublicId.id);
            }
        } catch (error) {
            if (!isUserIdColumnMissing(error)) {
                try {
                    const rawResolvedId = await findUserIdByPublicIdRaw(sessionPublicUserId);
                    if (rawResolvedId) {
                        return writeCachedSessionUserId(cacheKeys, rawResolvedId);
                    }
                } catch {
                    return null;
                }
            }
        }
    }

    const sessionEmail = normalizeString(session?.user?.email);
    if (sessionEmail) {
        try {
            const user = await prisma.user.findFirst({
                where: { email: { equals: sessionEmail, mode: "insensitive" } },
                select: { id: true },
            });
            if (user?.id) {
                return writeCachedSessionUserId(cacheKeys, user.id);
            }
        } catch {
            try {
                const rawResolvedId = await findUserIdByEmailRaw(sessionEmail);
                if (rawResolvedId) {
                    return writeCachedSessionUserId(cacheKeys, rawResolvedId);
                }
            } catch {
                // Fall through to name-based lookup.
            }
        }
    }

    const sessionName = normalizeString(session?.user?.name);
    if (!sessionName) {
        return null;
    }

    try {
        const user = await prisma.user.findFirst({
            where: { name: { equals: sessionName, mode: "insensitive" } },
            select: { id: true },
        });
        return user?.id ? writeCachedSessionUserId(cacheKeys, user.id) : null;
    } catch {
        try {
            const rawResolvedId = await findUserIdByNameRaw(sessionName);
            return rawResolvedId ? writeCachedSessionUserId(cacheKeys, rawResolvedId) : null;
        } catch {
            return null;
        }
    }
}
