import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveSessionUserId } from "@/lib/sessionUser";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
const DEFAULT_DM_SETTING: DmSetting = "OPEN";

const USER_PUBLIC_SELECT_WITH_USER_ID = {
    id: true,
    userId: true,
    name: true,
    email: true,
    image: true,
    headerImage: true,
    bio: true,
    aboutMe: true,
    links: true,
    posts: {
        where: { published: true },
        orderBy: { createdAt: "desc" as const },
    },
} as const;

const USER_PUBLIC_SELECT_LEGACY = {
    id: true,
    name: true,
    email: true,
    image: true,
    headerImage: true,
    bio: true,
    aboutMe: true,
    links: true,
    posts: {
        where: { published: true },
        orderBy: { createdAt: "desc" as const },
    },
} as const;

const USER_PUBLIC_SELECT_MINIMAL = {
    id: true,
    name: true,
    email: true,
    image: true,
} as const;

function parseDmSetting(value: unknown): DmSetting | undefined {
    if (value === "OPEN" || value === "PR_ONLY" || value === "CLOSED") {
        return value;
    }
    return undefined;
}

function unpackLinks(raw: string | null | undefined): { links: unknown[]; dmSetting: DmSetting } {
    if (!raw) {
        return { links: [], dmSetting: DEFAULT_DM_SETTING };
    }

    try {
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
            return { links: parsed, dmSetting: DEFAULT_DM_SETTING };
        }

        if (parsed && typeof parsed === "object") {
            const candidate = parsed as { items?: unknown; links?: unknown; dmSetting?: unknown };
            const links = Array.isArray(candidate.items)
                ? candidate.items
                : Array.isArray(candidate.links)
                  ? candidate.links
                  : [];
            const dmSetting = parseDmSetting(candidate.dmSetting) || DEFAULT_DM_SETTING;
            return { links, dmSetting };
        }
    } catch {
        return { links: [], dmSetting: DEFAULT_DM_SETTING };
    }

    return { links: [], dmSetting: DEFAULT_DM_SETTING };
}

function isUserSchemaCompatibilityError(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
        const code = String((error as { code?: unknown }).code || "");
        if (code === "P2021" || code === "P2022") return true;
    }

    if (error instanceof Error) {
        return /unknown arg|column .* does not exist|relation .* does not exist|permission denied|must be owner/i.test(
            error.message
        );
    }
    return false;
}

async function findByNameFallback(
    userRef: string,
    useUserIdColumn: boolean
): Promise<{
    id: string;
    userId?: string | null;
    name: string | null;
    email: string | null;
    image: string | null;
    headerImage: string | null;
    bio: string | null;
    aboutMe: string | null;
    links: string | null;
    posts: Array<{
        id: string;
        title: string;
        content: string;
        excerpt: string | null;
        headerImage: string | null;
        tags: string[];
        published: boolean;
        pinned: boolean;
        createdAt: Date;
        updatedAt: Date;
        authorId: string;
    }>;
} | null> {
    if (!userRef) return null;

    if (useUserIdColumn) {
        try {
            const matched = await prisma.user.findFirst({
                where: { name: { equals: userRef, mode: "insensitive" } },
                select: USER_PUBLIC_SELECT_WITH_USER_ID,
            });
            return matched || null;
        } catch (error) {
            if (!isUserSchemaCompatibilityError(error)) {
                throw error;
            }
        }
    }

    const matched = await prisma.user.findFirst({
        where: { name: { equals: userRef, mode: "insensitive" } },
        select: USER_PUBLIC_SELECT_LEGACY,
    });
    return matched || null;
}

async function findUserProfileByRef(userRef: string, userRefLower: string) {
    try {
        const byIdOrUserId = await prisma.user.findFirst({
            where: {
                OR: [{ userId: userRefLower }, { id: userRef }],
            },
            select: USER_PUBLIC_SELECT_WITH_USER_ID,
        });
        if (byIdOrUserId) return byIdOrUserId;

        return findByNameFallback(userRef, true);
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) {
            throw error;
        }
    }

    try {
        const byId = await prisma.user.findUnique({
            where: { id: userRef },
            select: USER_PUBLIC_SELECT_LEGACY,
        });
        if (byId) return byId;
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) {
            throw error;
        }
    }

    try {
        const byName = await findByNameFallback(userRef, false);
        if (byName) return byName;
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) {
            throw error;
        }
    }

    let basicUser:
        | {
              id: string;
              name: string | null;
              email: string | null;
              image: string | null;
          }
        | null = null;

    try {
        basicUser = await prisma.user.findFirst({
            where: {
                OR: [{ id: userRef }, { userId: userRefLower }, { name: { equals: userRef, mode: "insensitive" } }],
            },
            select: USER_PUBLIC_SELECT_MINIMAL,
        });
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) {
            throw error;
        }
    }

    if (!basicUser) {
        basicUser = await prisma.user.findFirst({
            where: {
                OR: [{ id: userRef }, { name: { equals: userRef, mode: "insensitive" } }],
            },
            select: USER_PUBLIC_SELECT_MINIMAL,
        });
    }

    if (!basicUser) return null;

    let posts:
        | Array<{
              id: string;
              title: string;
              content: string;
              excerpt: string | null;
              headerImage: string | null;
              tags: string[];
              published: boolean;
              pinned: boolean;
              createdAt: Date;
              updatedAt: Date;
              authorId: string;
          }>
        | null = null;

    try {
        const rows = await prisma.post.findMany({
            where: { authorId: basicUser.id, published: true },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                content: true,
                excerpt: true,
                headerImage: true,
                tags: true,
                published: true,
                pinned: true,
                createdAt: true,
                updatedAt: true,
                authorId: true,
            },
        });
        posts = rows;
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) {
            throw error;
        }
    }

    if (!posts) {
        try {
            const rows = await prisma.post.findMany({
                where: { authorId: basicUser.id },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    title: true,
                    content: true,
                    createdAt: true,
                    authorId: true,
                },
            });
            posts = rows.map((row) => ({
                id: row.id,
                title: row.title,
                content: row.content,
                excerpt: null,
                headerImage: null,
                tags: [] as string[],
                published: true,
                pinned: false,
                createdAt: row.createdAt,
                updatedAt: row.createdAt,
                authorId: row.authorId,
            }));
        } catch (error) {
            if (!isUserSchemaCompatibilityError(error)) {
                throw error;
            }
            posts = [];
        }
    }

    return {
        id: basicUser.id,
        name: basicUser.name,
        email: basicUser.email,
        image: basicUser.image,
        headerImage: null,
        bio: null,
        aboutMe: null,
        links: null,
        posts,
    };
}

async function findCurrentSessionUserFallback(userRef: string) {
    const session = await auth();
    const sessionUserId = await resolveSessionUserId(session);
    const sessionPublicUserId =
        typeof session?.user?.userId === "string" ? session.user.userId.trim() : "";

    if (!sessionUserId || !sessionPublicUserId || sessionPublicUserId !== userRef) {
        return null;
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: sessionUserId },
            select: USER_PUBLIC_SELECT_WITH_USER_ID,
        });
        if (user) return user;
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) {
            throw error;
        }
    }

    return prisma.user.findUnique({
        where: { id: sessionUserId },
        select: USER_PUBLIC_SELECT_LEGACY,
    });
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;
    const userRef = typeof name === "string" ? name.trim() : "";
    const userRefLower = userRef.toLowerCase();

    try {
        const user = await findUserProfileByRef(userRef, userRefLower);
        const fallbackUser = user || (await findCurrentSessionUserFallback(userRef));
        if (!fallbackUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const unpacked = unpackLinks(fallbackUser.links);

        const ensuredUserId =
            ("userId" in fallbackUser && typeof fallbackUser.userId === "string" && fallbackUser.userId.trim())
                ? fallbackUser.userId.trim()
                : fallbackUser.id;

        return NextResponse.json({
            ...fallbackUser,
            userId: ensuredUserId,
            links: unpacked.links,
            dmSetting: unpacked.dmSetting,
        });
    } catch (error) {
        console.error("Failed to fetch user:", error);
        return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
    }
}
