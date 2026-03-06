import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { getUserProfileByRefFallback } from "@/lib/publicContentFallback";
import { getPostsByAuthorFallback } from "@/lib/publicContentFallback";
import { resolveReadablePublicUserId } from "@/lib/userId";

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

async function findCurrentSessionUserFallback(req: Request, userRef: string) {
    const session = await auth(req as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    const sessionUserId = await resolveSessionUserId(session);
    const sessionPublicUserId =
        typeof session?.user?.userId === "string" ? session.user.userId.trim() : "";
    const normalizedUserRef = userRef.trim().toLowerCase();
    const sessionPrimaryRef = sessionUserId ? sessionUserId.trim().toLowerCase() : "";
    const sessionPublicRef = sessionPublicUserId.toLowerCase();

    if (
        !sessionUserId ||
        (normalizedUserRef !== sessionPrimaryRef && normalizedUserRef !== sessionPublicRef)
    ) {
        return null;
    }

    const fallbackFromProfile = await findUserProfileByRef(sessionUserId, sessionUserId.toLowerCase());
    if (fallbackFromProfile) {
        return fallbackFromProfile;
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

    try {
        const legacyUser = await prisma.user.findUnique({
            where: { id: sessionUserId },
            select: USER_PUBLIC_SELECT_LEGACY,
        });
        if (legacyUser) {
            return legacyUser;
        }
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) {
            throw error;
        }
    }

    const minimalUser = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: USER_PUBLIC_SELECT_MINIMAL,
    });

    if (!minimalUser) {
        return null;
    }

    return {
        id: minimalUser.id,
        name: minimalUser.name,
        email: minimalUser.email,
        image: minimalUser.image,
        headerImage: null,
        bio: null,
        aboutMe: null,
        links: null,
        posts: [],
    };
}

function hasResolvedValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

type UserProfileCandidate = {
    id: string;
    userId?: string | null;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    headerImage?: string | null;
    bio?: string | null;
    aboutMe?: string | null;
    links?: string | null;
    posts?: unknown[];
};

function mergeUserProfileCandidates(
    primary: UserProfileCandidate | null,
    secondary: UserProfileCandidate | null
): UserProfileCandidate | null {
    if (!primary) return secondary;
    if (!secondary) return primary;

    const primaryPosts = Array.isArray(primary.posts) ? primary.posts : [];
    const secondaryPosts = Array.isArray(secondary.posts) ? secondary.posts : [];

    return {
        ...secondary,
        ...primary,
        userId: hasResolvedValue(primary.userId) ? primary.userId : secondary.userId,
        name: hasResolvedValue(primary.name) ? primary.name : secondary.name,
        email: hasResolvedValue(primary.email) ? primary.email : secondary.email,
        image: hasResolvedValue(primary.image) ? primary.image : secondary.image,
        headerImage: hasResolvedValue(primary.headerImage) ? primary.headerImage : secondary.headerImage,
        bio: hasResolvedValue(primary.bio) ? primary.bio : secondary.bio,
        aboutMe: hasResolvedValue(primary.aboutMe) ? primary.aboutMe : secondary.aboutMe,
        links: hasResolvedValue(primary.links) ? primary.links : secondary.links,
        posts: primaryPosts.length >= secondaryPosts.length ? primaryPosts : secondaryPosts,
    };
}

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;
    const userRef = typeof name === "string" ? name.trim() : "";
    const userRefLower = userRef.toLowerCase();

    try {
        const prismaUser = await findUserProfileByRef(userRef, userRefLower);
        const rawUser = await getUserProfileByRefFallback(userRef);
        const sessionUser = await findCurrentSessionUserFallback(req, userRef);
        const resolvedUser = mergeUserProfileCandidates(
            mergeUserProfileCandidates(prismaUser, rawUser),
            sessionUser
        );

        if (!resolvedUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const unpacked = unpackLinks(resolvedUser.links);

        const ensuredUserId = resolveReadablePublicUserId({
            id: resolvedUser.id,
            userId: "userId" in resolvedUser ? resolvedUser.userId : null,
            name: resolvedUser.name ?? null,
            email: resolvedUser.email ?? null,
        });
        const fallbackPosts = await getPostsByAuthorFallback([resolvedUser.id, ensuredUserId || null], {
            publishedOnly: true,
            limit: 300,
        });
        const resolvedPosts = Array.isArray(resolvedUser.posts) ? resolvedUser.posts : [];

        return NextResponse.json({
            ...resolvedUser,
            userId: ensuredUserId || null,
            posts: resolvedPosts.length >= fallbackPosts.length ? resolvedPosts : fallbackPosts,
            links: unpacked.links,
            dmSetting: unpacked.dmSetting,
        });
    } catch (error) {
        console.error("Failed to fetch user:", error);
        return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
    }
}
