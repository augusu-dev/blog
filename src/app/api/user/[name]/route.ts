import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ensureUserIdForUser, ensureUserIdSchema } from "@/lib/userId";

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
        const matched = await prisma.user.findFirst({
            where: { name: { equals: userRef, mode: "insensitive" } },
            select: USER_PUBLIC_SELECT_WITH_USER_ID,
        });
        return matched || null;
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
        if (!isUserIdColumnMissing(error)) {
            throw error;
        }
    }

    const byId = await prisma.user.findUnique({
        where: { id: userRef },
        select: USER_PUBLIC_SELECT_LEGACY,
    });
    if (byId) return byId;

    return findByNameFallback(userRef, false);
}

async function findCurrentSessionUserFallback(userRef: string) {
    const session = await auth();
    const sessionUserId = session?.user?.id;
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
        if (!isUserIdColumnMissing(error)) {
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
        try {
            await ensureUserIdSchema();
        } catch (schemaError) {
            console.error("Failed to ensure userId schema in profile route:", schemaError);
        }

        const user = await findUserProfileByRef(userRef, userRefLower);
        const fallbackUser = user || (await findCurrentSessionUserFallback(userRef));
        if (!fallbackUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const unpacked = unpackLinks(fallbackUser.links);

        let ensuredUserId =
            ("userId" in fallbackUser && typeof fallbackUser.userId === "string" && fallbackUser.userId.trim())
                ? fallbackUser.userId.trim()
                : fallbackUser.id;
        try {
            ensuredUserId = await ensureUserIdForUser(fallbackUser.id);
        } catch (ensureError) {
            console.error("Failed to ensure userId in profile route:", ensureError);
        }

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
