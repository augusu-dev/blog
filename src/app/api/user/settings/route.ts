import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { resolveSessionUserId } from "@/lib/sessionUser";
import {
    isValidUserId,
    normalizeUserIdInput,
} from "@/lib/userId";
import { tryEnsureProfileAndPostSchema } from "@/lib/schemaCompat";
import { getTableColumns } from "@/lib/tableSchema";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
type ThemeName = "default" | "lightblue" | "sand" | "apricot" | "white" | "black" | "custom";

const DEFAULT_DM_SETTING: DmSetting = "OPEN";
const DEFAULT_THEME: ThemeName = "default";
const DEFAULT_THEME_CUSTOM_COLOR = "#925c5c";

const USER_SETTINGS_SELECT_WITH_USER_ID = {
    id: true,
    userId: true,
    name: true,
    email: true,
    image: true,
    headerImage: true,
    bio: true,
    aboutMe: true,
    links: true,
} as const;

const USER_SETTINGS_SELECT_LEGACY = {
    id: true,
    name: true,
    email: true,
    image: true,
    headerImage: true,
    bio: true,
    aboutMe: true,
    links: true,
} as const;

const USER_SETTINGS_SELECT_MINIMAL = {
    id: true,
    name: true,
    email: true,
    image: true,
} as const;

type UserSettingsPayload = {
    id: string;
    userId?: string | null;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    headerImage?: string | null;
    bio?: string | null;
    aboutMe?: string | null;
    links?: string | null;
};

type RawSettingsRow = {
    id: string;
    userId: string | null;
    name: string | null;
    email: string | null;
    image: string | null;
    headerImage: string | null;
    bio: string | null;
    aboutMe: string | null;
    links: string | null;
};

function parseDmSetting(value: unknown): DmSetting | undefined {
    if (value === undefined) return undefined;
    if (value === "OPEN" || value === "PR_ONLY" || value === "CLOSED") {
        return value;
    }
    return undefined;
}

function parseThemeName(value: unknown): ThemeName | undefined {
    if (value === undefined) return undefined;
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
    if (value === undefined) return undefined;
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    const match = trimmed.match(/^#?[0-9a-fA-F]{6}$/);
    if (!match) return undefined;
    return `#${trimmed.replace(/^#/, "").toLowerCase()}`;
}

function normalizeNullableString(value: unknown): string | null {
    if (value === null) return null;
    if (value === undefined) return null;
    if (typeof value === "string") return value;
    return String(value);
}

async function fetchUserSettingsRecordRaw(userId: string) {
    const columns = await getTableColumns("User");
    if (!columns.has("id")) {
        return { user: null, hasUserIdColumn: false as const };
    }

    const rows = await prisma.$queryRawUnsafe<RawSettingsRow[]>(
        `
            SELECT
                "id"::text AS "id",
                ${columns.has("userId") ? `"userId"::text` : `NULL::text`} AS "userId",
                ${columns.has("name") ? `"name"::text` : `NULL::text`} AS "name",
                ${columns.has("email") ? `"email"::text` : `NULL::text`} AS "email",
                ${columns.has("image") ? `"image"::text` : `NULL::text`} AS "image",
                ${columns.has("headerImage") ? `"headerImage"::text` : `NULL::text`} AS "headerImage",
                ${columns.has("bio") ? `"bio"::text` : `NULL::text`} AS "bio",
                ${columns.has("aboutMe") ? `"aboutMe"::text` : `NULL::text`} AS "aboutMe",
                ${columns.has("links") ? `"links"::text` : `NULL::text`} AS "links"
            FROM "User"
            WHERE "id"::text = $1
            LIMIT 1
        `,
        userId
    );

    return {
        user: rows[0] || null,
        hasUserIdColumn: columns.has("userId") as boolean,
    };
}

function unpackLinks(raw: string | null | undefined): {
    links: unknown[];
    dmSetting: DmSetting;
    theme: ThemeName;
    themeCustomColor: string;
} {
    if (!raw) {
        return {
            links: [],
            dmSetting: DEFAULT_DM_SETTING,
            theme: DEFAULT_THEME,
            themeCustomColor: DEFAULT_THEME_CUSTOM_COLOR,
        };
    }

    try {
        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
            return {
                links: parsed,
                dmSetting: DEFAULT_DM_SETTING,
                theme: DEFAULT_THEME,
                themeCustomColor: DEFAULT_THEME_CUSTOM_COLOR,
            };
        }

        if (parsed && typeof parsed === "object") {
            const candidate = parsed as {
                items?: unknown;
                links?: unknown;
                dmSetting?: unknown;
                theme?: unknown;
                themeCustomColor?: unknown;
            };
            const links = Array.isArray(candidate.items)
                ? candidate.items
                : Array.isArray(candidate.links)
                  ? candidate.links
                  : [];
            const dmSetting = parseDmSetting(candidate.dmSetting) || DEFAULT_DM_SETTING;
            const theme = parseThemeName(candidate.theme) || DEFAULT_THEME;
            const themeCustomColor =
                parseThemeColor(candidate.themeCustomColor) || DEFAULT_THEME_CUSTOM_COLOR;
            return { links, dmSetting, theme, themeCustomColor };
        }
    } catch {
        return {
            links: [],
            dmSetting: DEFAULT_DM_SETTING,
            theme: DEFAULT_THEME,
            themeCustomColor: DEFAULT_THEME_CUSTOM_COLOR,
        };
    }

    return {
        links: [],
        dmSetting: DEFAULT_DM_SETTING,
        theme: DEFAULT_THEME,
        themeCustomColor: DEFAULT_THEME_CUSTOM_COLOR,
    };
}

function packLinks(
    links: unknown[],
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

async function fetchUserSettingsRecord(userId: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: USER_SETTINGS_SELECT_WITH_USER_ID,
        });
        return { user, hasUserIdColumn: true as const };
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) throw error;
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: USER_SETTINGS_SELECT_LEGACY,
        });
        return { user, hasUserIdColumn: false as const };
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) throw error;
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: USER_SETTINGS_SELECT_MINIMAL,
        });
        if (user) {
            return { user, hasUserIdColumn: false as const };
        }
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) throw error;
    }

    return fetchUserSettingsRecordRaw(userId);
}

async function fetchCurrentLinksAndUserId(userId: string) {
    try {
        const current = await prisma.user.findUnique({
            where: { id: userId },
            select: { links: true, userId: true },
        });
        return { current, hasUserIdColumn: true as const };
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) throw error;
    }

    try {
        const current = await prisma.user.findUnique({
            where: { id: userId },
            select: { links: true },
        });
        return { current, hasUserIdColumn: false as const };
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) throw error;
    }

    try {
        const current = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });
        if (current) {
            return { current, hasUserIdColumn: false as const };
        }
    } catch (error) {
        if (!isUserSchemaCompatibilityError(error)) throw error;
    }

    const raw = await fetchUserSettingsRecordRaw(userId);
    if (!raw.user) {
        return { current: null, hasUserIdColumn: raw.hasUserIdColumn };
    }

    return {
        current: {
            id: raw.user.id,
            links: raw.user.links,
            ...(raw.hasUserIdColumn ? { userId: raw.user.userId } : {}),
        },
        hasUserIdColumn: raw.hasUserIdColumn,
    };
}

export async function GET() {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { user } = await fetchUserSettingsRecord(userId);
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const unpacked = unpackLinks(("links" in user ? user.links : null) as string | null | undefined);
        const publicUserId =
            ("userId" in user && typeof user.userId === "string" && user.userId.trim())
                ? user.userId.trim()
                : user.id;

        return NextResponse.json({
            id: user.id,
            userId: publicUserId,
            name: ("name" in user ? user.name : null) ?? null,
            email: ("email" in user ? user.email : null) ?? null,
            image: ("image" in user ? user.image : null) ?? null,
            headerImage: ("headerImage" in user ? user.headerImage : null) ?? null,
            bio: ("bio" in user ? user.bio : null) ?? null,
            aboutMe: ("aboutMe" in user ? user.aboutMe : null) ?? null,
            links: unpacked.links,
            dmSetting: unpacked.dmSetting,
            theme: unpacked.theme,
            themeCustomColor: unpacked.themeCustomColor,
        });
    } catch (error) {
        console.error("Failed to fetch user settings:", error);
        return NextResponse.json({ error: "Failed to fetch user settings" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
        name,
        bio,
        aboutMe,
        links,
        image,
        headerImage,
        dmSetting,
        theme,
        themeCustomColor,
        userId: userIdInput,
    } = await request.json();

    const parsedDmSetting = parseDmSetting(dmSetting);
    const parsedTheme = parseThemeName(theme);
    const parsedThemeCustomColor = parseThemeColor(themeCustomColor);
    const normalizedUserId = userIdInput === undefined ? undefined : normalizeUserIdInput(userIdInput);

    if (dmSetting !== undefined && !parsedDmSetting) {
        return NextResponse.json(
            { error: "Invalid dmSetting. Use OPEN, PR_ONLY, or CLOSED." },
            { status: 400 }
        );
    }

    if (theme !== undefined && !parsedTheme) {
        return NextResponse.json(
            {
                error: "Invalid theme. Use default, lightblue, sand, apricot, white, black, or custom.",
            },
            { status: 400 }
        );
    }

    if (themeCustomColor !== undefined && !parsedThemeCustomColor) {
        return NextResponse.json(
            { error: "Invalid themeCustomColor. Use hex color like #925c5c." },
            { status: 400 }
        );
    }

    if (userIdInput !== undefined && !isValidUserId(normalizedUserId || "")) {
        return NextResponse.json(
            { error: "Invalid userId. Use 3-32 chars: lowercase letters, numbers, underscore." },
            { status: 400 }
        );
    }

    try {
        await tryEnsureProfileAndPostSchema();
        const { current, hasUserIdColumn } = await fetchCurrentLinksAndUserId(userId);

        if (!current) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (
            normalizedUserId &&
            hasUserIdColumn &&
            "userId" in current &&
            normalizedUserId !== (current.userId || "")
        ) {
            const existing = await prisma.user.findFirst({
                where: {
                    userId: normalizedUserId,
                    NOT: { id: userId },
                },
                select: { id: true },
            });

            if (existing) {
                return NextResponse.json({ error: "This userId is already in use." }, { status: 409 });
            }
        }

        const currentUnpacked = unpackLinks(
            ("links" in current ? current.links : null) as string | null | undefined
        );
        const nextLinks = Array.isArray(links) ? links : currentUnpacked.links;
        const nextDmSetting = parsedDmSetting || currentUnpacked.dmSetting;
        const nextTheme = parsedTheme || currentUnpacked.theme;
        const nextThemeCustomColor = parsedThemeCustomColor || currentUnpacked.themeCustomColor;

        const updateData: Prisma.UserUpdateInput = {
            links: packLinks(nextLinks, nextDmSetting, nextTheme, nextThemeCustomColor),
        };

        if (name !== undefined) updateData.name = normalizeNullableString(name);
        if (bio !== undefined) updateData.bio = normalizeNullableString(bio);
        if (aboutMe !== undefined) updateData.aboutMe = normalizeNullableString(aboutMe);
        if (image !== undefined) updateData.image = normalizeNullableString(image);
        if (headerImage !== undefined) updateData.headerImage = normalizeNullableString(headerImage);

        if (hasUserIdColumn && normalizedUserId !== undefined) {
            updateData.userId = normalizedUserId;
        }

        let updatedUser: UserSettingsPayload | null = null;

        if (hasUserIdColumn) {
            try {
                updatedUser = await prisma.user.update({
                    where: { id: userId },
                    data: updateData,
                    select: USER_SETTINGS_SELECT_WITH_USER_ID,
                });
            } catch (error) {
                if (!isUserSchemaCompatibilityError(error)) throw error;
            }
        }

        if (!updatedUser) {
            const legacyUpdateData = { ...updateData };
            delete (legacyUpdateData as { userId?: string }).userId;
            updatedUser = await prisma.user.update({
                where: { id: userId },
                data: legacyUpdateData,
                select: USER_SETTINGS_SELECT_MINIMAL,
            });
        }

        const refreshed = await fetchUserSettingsRecord(userId);
        const responseUser = refreshed.user || updatedUser;
        const unpacked = unpackLinks(
            ("links" in responseUser ? responseUser.links : null) as string | null | undefined
        );
        const publicUserId =
            ("userId" in responseUser && typeof responseUser.userId === "string" && responseUser.userId.trim())
                ? responseUser.userId.trim()
                : responseUser.id;

        return NextResponse.json({
            id: responseUser.id,
            userId: publicUserId,
            name: ("name" in responseUser ? responseUser.name : null) ?? null,
            email: ("email" in responseUser ? responseUser.email : null) ?? null,
            image: ("image" in responseUser ? responseUser.image : null) ?? null,
            headerImage: ("headerImage" in responseUser ? responseUser.headerImage : null) ?? null,
            bio: ("bio" in responseUser ? responseUser.bio : null) ?? null,
            aboutMe: ("aboutMe" in responseUser ? responseUser.aboutMe : null) ?? null,
            links: unpacked.links,
            dmSetting: unpacked.dmSetting,
            theme: unpacked.theme,
            themeCustomColor: unpacked.themeCustomColor,
        });
    } catch (error) {
        console.error("Failed to update user settings:", error);
        return NextResponse.json({ error: "Failed to update user settings" }, { status: 500 });
    }
}

export async function DELETE() {
    const session = await auth();
    const userId = await resolveSessionUserId(session);
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.user.delete({
        where: { id: userId },
    });

    return NextResponse.json({ message: "Account deleted" });
}
