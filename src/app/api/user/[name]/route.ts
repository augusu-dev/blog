import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { getUserProfileByRefFallback } from "@/lib/publicContentFallback";
import { getPostsByAuthorFallback } from "@/lib/publicContentFallback";
import { hydratePullRequestProposers } from "@/lib/pullRequestPostMeta";
import { resolveReadablePublicUserId } from "@/lib/userId";
import { readCacheKeys, readThroughCache, writeReadCache } from "@/lib/readCache";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
const DEFAULT_DM_SETTING: DmSetting = "OPEN";
const USER_PROFILE_CACHE_TTL_MS = 20 * 1000;

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
            sourcePullRequestId?: string | null;
            pullRequestProposerId?: string | null;
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
            sourcePullRequestId?: string | null;
            pullRequestProposerId?: string | null;
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
                sourcePullRequestId: true,
                pullRequestProposerId: true,
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
                    sourcePullRequestId: true,
                    pullRequestProposerId: true,
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
                sourcePullRequestId: row.sourcePullRequestId,
                pullRequestProposerId: row.pullRequestProposerId,
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

type UserProfileCacheable = Omit<UserProfileCandidate, "links"> & {
    links?: unknown;
};

function shouldHydrateUserProfileFromFallback(candidate: UserProfileCandidate | null): boolean {
    if (!candidate) return true;

    return (
        !("headerImage" in candidate) ||
        !("bio" in candidate) ||
        !("aboutMe" in candidate) ||
        !("links" in candidate) ||
        !("posts" in candidate)
    );
}

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

function hasMeaningfulProfileData(candidate: UserProfileCacheable | null): boolean {
    if (!candidate) return false;

    return (
        (Array.isArray(candidate.posts) && candidate.posts.length > 0) ||
        hasResolvedValue(candidate.headerImage) ||
        hasResolvedValue(candidate.bio) ||
        hasResolvedValue(candidate.aboutMe) ||
        hasResolvedValue(candidate.links) ||
        hasResolvedValue(candidate.image) ||
        hasResolvedValue(candidate.name) ||
        hasResolvedValue(candidate.email)
    );
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }
) {
    const { name } = await params;
    const userRef = typeof name === "string" ? name.trim() : "";
    const userRefLower = userRef.toLowerCase();

    try {
        const payload = await readThroughCache(
            readCacheKeys.userProfile(userRef),
            USER_PROFILE_CACHE_TTL_MS,
            async () => {
                const prismaUser = await findUserProfileByRef(userRef, userRefLower);
                let rawUser = null;
                if (
                    shouldHydrateUserProfileFromFallback(prismaUser) ||
                    (Array.isArray(prismaUser?.posts) && prismaUser.posts.length === 0)
                ) {
                    try {
                        rawUser = await getUserProfileByRefFallback(userRef);
                    } catch (fallbackError) {
                        console.error("Failed to hydrate user profile from raw fallback:", fallbackError);
                    }
                }
                const mergedUser = mergeUserProfileCandidates(prismaUser, rawUser);
                let sessionUser = null;
                if (!mergedUser) {
                    try {
                        sessionUser = await findCurrentSessionUserFallback(userRef);
                    } catch (sessionFallbackError) {
                        console.error("Failed to hydrate current session user fallback:", sessionFallbackError);
                    }
                }
                const resolvedUser = mergeUserProfileCandidates(
                    mergedUser,
                    sessionUser
                );

                if (!resolvedUser) {
                    throw new Error("USER_NOT_FOUND");
                }

                const unpacked = unpackLinks(resolvedUser.links);

                const ensuredUserId = resolveReadablePublicUserId({
                    id: resolvedUser.id,
                    userId: "userId" in resolvedUser ? resolvedUser.userId : null,
                    name: resolvedUser.name ?? null,
                    email: resolvedUser.email ?? null,
                });
                const resolvedPosts = Array.isArray(resolvedUser.posts) ? resolvedUser.posts : [];
                let fallbackPosts: Awaited<ReturnType<typeof getPostsByAuthorFallback>> = [];
                if (resolvedPosts.length === 0) {
                    try {
                        fallbackPosts = await getPostsByAuthorFallback([resolvedUser.id, ensuredUserId || null, userRef], {
                            publishedOnly: true,
                            limit: 300,
                        });
                    } catch (postsFallbackError) {
                        console.error("Failed to hydrate profile posts from raw fallback:", postsFallbackError);
                    }
                }

                const hydratedPosts = await hydratePullRequestProposers(
                    (resolvedPosts.length >= fallbackPosts.length ? resolvedPosts : fallbackPosts) as Array<{
                        pullRequestProposerId?: string | null;
                        pullRequestProposer?: {
                            id: string;
                            userId?: string | null;
                            name: string | null;
                            email: string | null;
                            image: string | null;
                        } | null;
                    }>
                );

                const responsePayload = {
                    ...resolvedUser,
                    userId: ensuredUserId || null,
                    posts: hydratedPosts,
                    links: unpacked.links,
                    dmSetting: unpacked.dmSetting,
                };

                for (const ref of [userRef, resolvedUser.id, ensuredUserId || null, resolvedUser.name || null, resolvedUser.email || null]) {
                    if (!ref) continue;
                    writeReadCache(readCacheKeys.userProfile(ref), responsePayload, USER_PROFILE_CACHE_TTL_MS);
                }

                return responsePayload;
            },
            {
                shouldCache: (value) => hasMeaningfulProfileData(value),
                useStaleOnError: true,
                useStaleWhen: (value, staleValue) =>
                    !hasMeaningfulProfileData(value) && hasMeaningfulProfileData(staleValue),
            }
        );

        return NextResponse.json(payload);
    } catch (error) {
        if (error instanceof Error && error.message === "USER_NOT_FOUND") {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        console.error("Failed to fetch user:", error);
        return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
    }
}
