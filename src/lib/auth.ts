import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const googleEnabled =
    typeof process.env.GOOGLE_CLIENT_ID === "string" &&
    process.env.GOOGLE_CLIENT_ID.length > 0 &&
    typeof process.env.GOOGLE_CLIENT_SECRET === "string" &&
    process.env.GOOGLE_CLIENT_SECRET.length > 0;

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
            throw error;
        }
    }

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
}

async function verifyPassword(password: string, storedPassword: string, userId: string): Promise<boolean> {
    try {
        if (await bcrypt.compare(password, storedPassword)) {
            return true;
        }
    } catch {
        // Fall through to legacy plain-text compatibility.
    }

    if (password !== storedPassword) {
        return false;
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 12);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });
    } catch (error) {
        console.error("Failed to migrate legacy password hash:", error);
    }

    return true;
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
                    userId:
                        hasUserIdColumn &&
                        "userId" in user &&
                        typeof user.userId === "string" &&
                        user.userId.trim()
                            ? user.userId
                            : user.id,
                };
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
                if (typeof user.userId === "string" && user.userId.trim()) {
                    token.userId = user.userId;
                }
            }

            const tokenPrimaryId =
                (typeof token.id === "string" && token.id) ||
                (typeof token.sub === "string" && token.sub) ||
                "";

            if (tokenPrimaryId) {
                token.id = tokenPrimaryId;
                if (typeof token.userId !== "string" || !token.userId.trim()) {
                    token.userId = tokenPrimaryId;
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
                    typeof token.userId === "string" && token.userId.trim()
                        ? token.userId
                        : tokenPrimaryId;
                session.user.userId = publicUserId;
            }
            return session;
        },
    },
});
