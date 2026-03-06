import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tryEnsureProfileAndPostSchema } from "@/lib/schemaCompat";
import { resolveSessionUserId } from "@/lib/sessionUser";
import { ensureShortPostSchema } from "@/lib/shortPosts";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
type ThemeName = "default" | "lightblue" | "sand" | "apricot" | "white" | "black" | "custom";

const DEFAULT_DM_SETTING: DmSetting = "OPEN";
const DEFAULT_THEME: ThemeName = "default";
const DEFAULT_THEME_CUSTOM_COLOR = "#925c5c";

function parseDmSetting(value: unknown): DmSetting | undefined {
    if (value === "OPEN" || value === "PR_ONLY" || value === "CLOSED") {
        return value;
    }
    return undefined;
}

function parseThemeName(value: unknown): ThemeName | undefined {
    if (
        value === "default" ||
        value === "lightblue" ||
        value === "sand" ||
        value === "apricot" ||
        value === "white" ||
        value === "black" ||
        value === "custom"
    ) {
        return value;
    }
    return undefined;
}

function parseThemeColor(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(trimmed)) return undefined;
    return `#${trimmed.replace(/^#/, "").toLowerCase()}`;
}

function normalizeNullableString(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value === "string") return value;
    return String(value);
}

function normalizeLinkItems(value: unknown): Array<{ label: string; url: string }> {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const link = item as { label?: unknown; url?: unknown };
        return [
            {
                label: typeof link.label === "string" ? link.label : "",
                url: typeof link.url === "string" ? link.url : "",
            },
        ];
    });
}

function packLinks(
    links: Array<{ label: string; url: string }>,
    dmSetting: DmSetting,
    theme: ThemeName,
    themeCustomColor: string
): string {
    if (
        dmSetting === DEFAULT_DM_SETTING &&
        theme === DEFAULT_THEME &&
        themeCustomColor === DEFAULT_THEME_CUSTOM_COLOR
    ) {
        return JSON.stringify(links);
    }

    return JSON.stringify({
        items: links,
        dmSetting,
        theme,
        themeCustomColor,
    });
}

function parseDate(value: unknown, fallback: Date): Date {
    if (typeof value !== "string" && !(value instanceof Date)) {
        return fallback;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date;
}

function normalizeImportedPosts(value: unknown, authorId: string) {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const post = item as {
            title?: unknown;
            content?: unknown;
            excerpt?: unknown;
            headerImage?: unknown;
            tags?: unknown;
            published?: unknown;
            createdAt?: unknown;
            updatedAt?: unknown;
        };

        const title = typeof post.title === "string" ? post.title.trim() : "";
        const content = typeof post.content === "string" ? post.content : "";
        if (!title || !content) return [];

        const createdAt = parseDate(post.createdAt, new Date());
        const updatedAt = parseDate(post.updatedAt, createdAt);

        return [
            {
                id: randomUUID(),
                authorId,
                title,
                content,
                excerpt: typeof post.excerpt === "string" ? post.excerpt : "",
                headerImage: normalizeNullableString(post.headerImage),
                tags: Array.isArray(post.tags)
                    ? post.tags.filter((tag): tag is string => typeof tag === "string")
                    : [],
                published: !!post.published,
                pinned: false,
                createdAt,
                updatedAt,
            },
        ];
    });
}

function normalizeImportedShortPosts(value: unknown, authorId: string) {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const post = item as { content?: unknown; createdAt?: unknown };
        const content = typeof post.content === "string" ? post.content.trim() : "";
        if (!content) return [];

        return [
            {
                id: randomUUID(),
                authorId,
                content: content.slice(0, 300),
                createdAt: parseDate(post.createdAt, new Date()),
            },
        ];
    });
}

export async function POST(request: NextRequest) {
    const session = await auth(request as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    const userId = await resolveSessionUserId(session as any) /* eslint-disable-line @typescript-eslint/no-explicit-any */;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
        return NextResponse.json({ error: "Invalid backup JSON" }, { status: 400 });
    }

    const payload = body as {
        profile?: {
            name?: unknown;
            image?: unknown;
            headerImage?: unknown;
            bio?: unknown;
            aboutMe?: unknown;
            links?: unknown;
            dmSetting?: unknown;
            theme?: unknown;
            themeCustomColor?: unknown;
        };
        posts?: unknown;
        shortPosts?: unknown;
    };

    const profile = payload.profile && typeof payload.profile === "object" ? payload.profile : {};
    const links = normalizeLinkItems(profile.links);
    const dmSetting = parseDmSetting(profile.dmSetting) || DEFAULT_DM_SETTING;
    const theme = parseThemeName(profile.theme) || DEFAULT_THEME;
    const themeCustomColor = parseThemeColor(profile.themeCustomColor) || DEFAULT_THEME_CUSTOM_COLOR;
    const posts = normalizeImportedPosts(payload.posts, userId);
    const shortPosts = normalizeImportedShortPosts(payload.shortPosts, userId);

    try {
        await tryEnsureProfileAndPostSchema();
        await ensureShortPostSchema();

        const updatedUser = await prisma.$transaction(async (tx) => {
            await tx.post.deleteMany({ where: { authorId: userId } });
            await tx.shortPost.deleteMany({ where: { authorId: userId } });

            await tx.user.update({
                where: { id: userId },
                data: {
                    name: normalizeNullableString(profile.name),
                    image: normalizeNullableString(profile.image),
                    headerImage: normalizeNullableString(profile.headerImage),
                    bio: normalizeNullableString(profile.bio),
                    aboutMe: normalizeNullableString(profile.aboutMe),
                    links: packLinks(links, dmSetting, theme, themeCustomColor),
                },
            });

            if (posts.length > 0) {
                await tx.post.createMany({ data: posts });
            }

            if (shortPosts.length > 0) {
                await tx.shortPost.createMany({ data: shortPosts });
            }

            return tx.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    userId: true,
                    name: true,
                    image: true,
                    headerImage: true,
                    bio: true,
                    aboutMe: true,
                },
            });
        });

        if (!updatedUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({
            message: "Import completed",
            postsCount: posts.length,
            shortPostsCount: shortPosts.length,
            user: {
                id: updatedUser.id,
                userId: updatedUser.userId || updatedUser.id,
                name: updatedUser.name,
                image: updatedUser.image,
                headerImage: updatedUser.headerImage,
                bio: updatedUser.bio,
                aboutMe: updatedUser.aboutMe,
                links,
                dmSetting,
                theme,
                themeCustomColor,
            },
        });
    } catch (error) {
        console.error("Import error:", error);
        return NextResponse.json({ error: "Failed to import backup" }, { status: 500 });
    }
}
