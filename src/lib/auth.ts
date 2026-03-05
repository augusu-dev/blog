import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { ensureUserIdForUser } from "./userId";

const googleEnabled =
    typeof process.env.GOOGLE_CLIENT_ID === "string" &&
    process.env.GOOGLE_CLIENT_ID.length > 0 &&
    typeof process.env.GOOGLE_CLIENT_SECRET === "string" &&
    process.env.GOOGLE_CLIENT_SECRET.length > 0;

async function resolveUserIdSafely(userId: string, fallback?: string | null): Promise<string> {
    try {
        return await ensureUserIdForUser(userId);
    } catch (error) {
        console.error("Failed to ensure userId for auth flow:", error);
        const fallbackValue = typeof fallback === "string" ? fallback.trim() : "";
        if (fallbackValue) return fallbackValue;
        return userId;
    }
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

                const email = credentials.email as string;
                const password = credentials.password as string;

                const user = await prisma.user.findUnique({ where: { email } });
                if (!user || !user.password) {
                    return null;
                }

                const isValid = await bcrypt.compare(password, user.password);
                if (!isValid) {
                    return null;
                }

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    userId: await resolveUserIdSafely(user.id, user.userId),
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
                token.userId = await resolveUserIdSafely(
                    tokenPrimaryId,
                    typeof token.userId === "string" ? token.userId : undefined
                );
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
