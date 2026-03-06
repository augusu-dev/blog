import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { getTableColumns } from "./tableSchema";
import { isValidUserId, normalizeUserIdInput } from "./userId";

const googleEnabled =
    typeof process.env.GOOGLE_CLIENT_ID === "string" &&
    process.env.GOOGLE_CLIENT_ID.length > 0 &&
    typeof process.env.GOOGLE_CLIENT_SECRET === "string" &&
    process.env.GOOGLE_CLIENT_SECRET.length > 0;

const PUBLIC_USER_ID_CACHE_TTL_MS = 5 * 60 * 1000;
const publicUserIdCache = new Map<string, { value: string; expiresAt: number }>();

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

async function findCredentialsUserByEmail(email: string) {
    try {
        const user = await prisma.user.findFirst({
            where: {
                email: {
                    equals: email,
                    mode: "insensitive",
                },
            },
            select: {
                id: true,
                email: true,
                name: true,
                password: true,
                userId: true,
            },
        });
        return {
            user,
            hasUserIdColumn: true as const,
        };
    } catch (error) {
        if (!isUserIdColumnMissing(error)) {
            const fallback = await findCredentialsUserByEmailRaw(email);
            if (fallback) {
                return fallback;
            }
            throw error;
        }
    }

    try {
        const user = await prisma.user.findFirst({
            where: {
                email: {
                    equals: email,
                    mode: "insensitive",
                },
            },
            select: {
                id: true,
                email: true,
                name: true,
                password: true,
            },
        });

        return {
            user,
            hasUserIdColumn: false as const,
        };
    } catch (error) {
        const fallback = await findCredentialsUserByEmailRaw(email);
        if (fallback) {
            return fallback;
        }
        throw error;
    }
}

type CredentialsLookupUser = {
    id: string;
    email: string | null;
    name: string | null;
    password: string | null;
    userId?: string | null;
};

function normalizeNullableString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function normalizeReadablePublicUserId(
    value: unknown,
    primaryUserId?: string
): string {
    const normalized = normalizeUserIdInput(value);
    const normalizedPrimary = normalizeUserIdInput(primaryUserId || "");

    if (!isValidUserId(normalized) || normalized === normalizedPrimary) {
        return "";
    }

    return normalized;
}

function readCachedPublicUserId(primaryUserId: string): string {
    const cached = publicUserIdCache.get(primaryUserId);
    if (!cached) return "";
    if (cached.expiresAt <= Date.now()) {
        publicUserIdCache.delete(primaryUserId);
        return "";
    }
    return cached.value;
}

function writeCachedPublicUserId(primaryUserId: string, publicUserId: string): string {
    if (!primaryUserId || !publicUserId) {
        return publicUserId;
    }

    publicUserIdCache.set(primaryUserId, {
        value: publicUserId,
        expiresAt: Date.now() + PUBLIC_USER_ID_CACHE_TTL_MS,
    });

    return publicUserId;
}

function normalizePasswordHashVariants(storedPassword: string): string[] {
    const variants = new Set([storedPassword]);

    if (storedPassword.startsWith("$2y$") || storedPassword.startsWith("$2x$")) {
        variants.add(`$2a$${storedPassword.slice(4)}`);
    }

    return [...variants];
}

async function migratePasswordHash(userId: string, password: string): Promise<void> {
    try {
        const hashedPassword = await bcrypt.hash(password, 12);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });
    } catch (error) {
        console.error("Failed to migrate legacy password hash:", error);
    }
}

async function findCredentialsUserByEmailRaw(email: string) {
    try {
        const columns = await getTableColumns("User");
        if (!columns.has("id") || !columns.has("email")) {
            return null;
        }

        const hasUserIdColumn = columns.has("userId");
        const select = [
            `"id"::text AS "id"`,
            `"email"::text AS "email"`,
            columns.has("name") ? `"name"::text AS "name"` : `NULL::text AS "name"`,
            columns.has("password") ? `"password"::text AS "password"` : `NULL::text AS "password"`,
            hasUserIdColumn ? `"userId"::text AS "userId"` : `NULL::text AS "userId"`,
        ];

        const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            `
                SELECT ${select.join(", ")}
                FROM "User"
                WHERE LOWER(COALESCE("email"::text, '')) = LOWER($1)
                ORDER BY "email" ASC NULLS LAST
                LIMIT 1
            `,
            email
        );

        const row = rows[0];
        const user: CredentialsLookupUser | null = row
            ? {
                id: String(row.id || ""),
                email: normalizeNullableString(row.email),
                name: normalizeNullableString(row.name),
                password: normalizeNullableString(row.password),
                userId: normalizeNullableString(row.userId),
            }
            : null;

        return {
            user,
            hasUserIdColumn: hasUserIdColumn as boolean,
        };
    } catch {
        return null;
    }
}

async function verifyPassword(password: string, storedPassword: string, userId: string): Promise<boolean> {
    for (const candidateHash of normalizePasswordHashVariants(storedPassword)) {
        try {
            if (await bcrypt.compare(password, candidateHash)) {
                if (candidateHash !== storedPassword) {
                    await migratePasswordHash(userId, password);
                }
                return true;
            }
        } catch {
            // Fall through to the next legacy variant.
        }
    }

    if (password !== storedPassword) {
        return false;
    }

    await migratePasswordHash(userId, password);

    return true;
}

async function resolveStablePublicUserId(
    primaryUserId: string,
    fallbackPublicUserId?: string | null,
    fallbackName?: string | null
): Promise<string> {
    const normalizedFallback = normalizeReadablePublicUserId(fallbackPublicUserId, primaryUserId);
    if (normalizedFallback) {
        return writeCachedPublicUserId(primaryUserId, normalizedFallback);
    }

    const cachedPublicUserId = readCachedPublicUserId(primaryUserId);
    if (cachedPublicUserId) {
        return cachedPublicUserId;
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: primaryUserId },
            select: {
                userId: true,
                name: true,
            },
        });

        const resolvedFromUser =
            normalizeReadablePublicUserId(user?.userId, primaryUserId) ||
            normalizeReadablePublicUserId(user?.name, primaryUserId);
        if (resolvedFromUser) {
            return writeCachedPublicUserId(primaryUserId, resolvedFromUser);
        }
    } catch {
        try {
            const legacyUser = await prisma.user.findUnique({
                where: { id: primaryUserId },
                select: {
                    name: true,
                },
            });
            const resolvedFromLegacyUser = normalizeReadablePublicUserId(
                legacyUser?.name,
                primaryUserId
            );
            if (resolvedFromLegacyUser) {
                return writeCachedPublicUserId(primaryUserId, resolvedFromLegacyUser);
            }
        } catch {
            // Ignore public user id lookup failures in auth callbacks.
        }
    }

    return normalizeReadablePublicUserId(fallbackName, primaryUserId);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    providers: [
        ...(googleEnabled
            ? [
                Google({
                    clientId: process.env.GOOGLE_CLIENT_ID!,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
                }),
            ]
            : []),
        Credentials({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                try {
                    if (!credentials?.email || !credentials?.password) {
                        return null;
                    }

                    const email = String(credentials.email).trim().toLowerCase();
                    const password = credentials.password as string;

                    const { user, hasUserIdColumn } = await findCredentialsUserByEmail(email);

                    if (!user || !user.password) {
                        return null;
                    }

                    const isValid = await verifyPassword(password, user.password, user.id);
                    if (!isValid) {
                        return null;
                    }

                    return {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        userId: await resolveStablePublicUserId(
                            user.id,
                            hasUserIdColumn && "userId" in user ? user.userId : null,
                            user.name
                        ),
                    };
                } catch (error) {
                    console.error("Credentials authorize failed:", error);
                    return null;
                }
            },
        }),
    ],
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                if (typeof user.id === "string" && user.id) {
                    token.id = user.id;
                }
                if (typeof user.id === "string" && user.id) {
                    token.userId = await resolveStablePublicUserId(
                        user.id,
                        typeof user.userId === "string" ? user.userId : null,
                        typeof user.name === "string" ? user.name : null
                    );
                }
            }

            const tokenPrimaryId =
                (typeof token.id === "string" && token.id) ||
                (typeof token.sub === "string" && token.sub) ||
                "";

            if (tokenPrimaryId) {
                token.id = tokenPrimaryId;
                const tokenPublicUserId =
                    typeof token.userId === "string" ? token.userId.trim() : "";
                if (!tokenPublicUserId || tokenPublicUserId === tokenPrimaryId) {
                    token.userId = await resolveStablePublicUserId(
                        tokenPrimaryId,
                        null,
                        typeof token.name === "string" ? token.name : null
                    );
                }
            }
            return token;
        },
        session({ session, token }) {
            const tokenPrimaryId =
                (typeof token.id === "string" && token.id) ||
                (typeof token.sub === "string" && token.sub) ||
                "";

            if (session.user && tokenPrimaryId) {
                session.user.id = tokenPrimaryId;
                const publicUserId =
                    typeof token.userId === "string" &&
                        token.userId.trim() &&
                        token.userId.trim() !== tokenPrimaryId
                        ? token.userId
                        : undefined;
                session.user.userId = publicUserId;
            }
            return session;
        },
    },
});
