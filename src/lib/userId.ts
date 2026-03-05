import { prisma } from "@/lib/db";

export const USER_ID_MIN_LENGTH = 3;
export const USER_ID_MAX_LENGTH = 32;

const USER_ID_COLUMN_SQL = `
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "userId" VARCHAR(32)
`;

const USER_ID_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "User_userId_key"
ON "User"("userId")
`;

const USER_ID_PATTERN = /^[a-z0-9_]{3,32}$/;

function compactUnderscores(value: string): string {
    return value.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

export function normalizeUserIdInput(value: unknown): string {
    if (typeof value !== "string") return "";
    const normalized = compactUnderscores(
        value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_")
    );
    return normalized.slice(0, USER_ID_MAX_LENGTH);
}

export function isValidUserId(value: string): boolean {
    return USER_ID_PATTERN.test(value);
}

function fallbackBase(userPk: string): string {
    return `user_${userPk.replace(/[^a-z0-9]/gi, "").slice(0, 12).toLowerCase() || "id"}`;
}

function makeBaseFromUser(name: string | null, email: string | null, userPk: string): string {
    const fromName = normalizeUserIdInput(name || "");
    if (fromName.length >= USER_ID_MIN_LENGTH) return fromName;

    const fromEmail = normalizeUserIdInput((email || "").split("@")[0] || "");
    if (fromEmail.length >= USER_ID_MIN_LENGTH) return fromEmail;

    return normalizeUserIdInput(fallbackBase(userPk));
}

function withSuffix(base: string, suffix: string): string {
    const maxBaseLength = Math.max(USER_ID_MIN_LENGTH, USER_ID_MAX_LENGTH - suffix.length);
    const trimmed = base.slice(0, maxBaseLength);
    return `${trimmed}${suffix}`;
}

export async function ensureUserIdSchema(): Promise<void> {
    await prisma.$executeRawUnsafe(USER_ID_COLUMN_SQL);
    await prisma.$executeRawUnsafe(USER_ID_INDEX_SQL);
}

export async function reserveAvailableUserId(baseCandidate: string, excludeUserPk?: string): Promise<string> {
    await ensureUserIdSchema();

    const baseNormalized = normalizeUserIdInput(baseCandidate);
    const base =
        baseNormalized.length >= USER_ID_MIN_LENGTH
            ? baseNormalized
            : normalizeUserIdInput(`user_${Math.random().toString(36).slice(2, 10)}`);

    for (let i = 0; i < 120; i += 1) {
        const suffix = i === 0 ? "" : `_${i}`;
        const candidate = withSuffix(base, suffix);
        if (!isValidUserId(candidate)) continue;

        const existing = await prisma.user.findFirst({
            where: {
                userId: candidate,
                ...(excludeUserPk ? { NOT: { id: excludeUserPk } } : {}),
            },
            select: { id: true },
        });

        if (!existing) {
            return candidate;
        }
    }

    return withSuffix(base, `_${Date.now().toString(36).slice(-4)}`);
}

export async function ensureUserIdForUser(userPk: string): Promise<string> {
    await ensureUserIdSchema();

    const user = await prisma.user.findUnique({
        where: { id: userPk },
        select: { id: true, userId: true, name: true, email: true },
    });

    if (!user) {
        throw new Error("User not found");
    }

    const current = normalizeUserIdInput(user.userId || "");
    if (isValidUserId(current)) {
        if (user.userId !== current) {
            await prisma.user.update({ where: { id: user.id }, data: { userId: current } });
        }
        return current;
    }

    const base = makeBaseFromUser(user.name, user.email, user.id);
    const next = await reserveAvailableUserId(base, user.id);
    await prisma.user.update({
        where: { id: user.id },
        data: { userId: next },
    });

    return next;
}
