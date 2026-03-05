import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
    ensureUserIdForUser,
    isValidUserId,
    normalizeUserIdInput,
} from "@/lib/userId";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
const DEFAULT_DM_SETTING: DmSetting = "OPEN";
type ThemeName = "default" | "lightblue" | "sand" | "apricot" | "white" | "black" | "custom";
const DEFAULT_THEME: ThemeName = "default";
const DEFAULT_THEME_CUSTOM_COLOR = "#925c5c";

const USER_SETTINGS_SELECT = {
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

export async function GET() {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureUserIdForUser(userId);

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: USER_SETTINGS_SELECT,
    });

    const unpacked = unpackLinks(user?.links);

    return NextResponse.json({
        ...user,
        links: unpacked.links,
        dmSetting: unpacked.dmSetting,
        theme: unpacked.theme,
        themeCustomColor: unpacked.themeCustomColor,
    });
}

export async function PUT(request: NextRequest) {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureUserIdForUser(userId);

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

    const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { links: true, userId: true },
    });

    if (!current) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (normalizedUserId && normalizedUserId !== current.userId) {
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

    const currentUnpacked = unpackLinks(current?.links);
    const nextLinks = Array.isArray(links) ? links : currentUnpacked.links;
    const nextDmSetting = parsedDmSetting || currentUnpacked.dmSetting;
    const nextTheme = parsedTheme || currentUnpacked.theme;
    const nextThemeCustomColor = parsedThemeCustomColor || currentUnpacked.themeCustomColor;

    const user = await prisma.user.update({
        where: { id: userId },
        data: {
            ...(name !== undefined && { name }),
            ...(bio !== undefined && { bio }),
            ...(aboutMe !== undefined && { aboutMe }),
            ...(image !== undefined && { image }),
            ...(headerImage !== undefined && { headerImage }),
            ...(normalizedUserId !== undefined && { userId: normalizedUserId }),
            links: packLinks(nextLinks, nextDmSetting, nextTheme, nextThemeCustomColor),
        },
        select: USER_SETTINGS_SELECT,
    });

    const unpacked = unpackLinks(user.links);

    return NextResponse.json({
        ...user,
        links: unpacked.links,
        dmSetting: unpacked.dmSetting,
        theme: unpacked.theme,
        themeCustomColor: unpacked.themeCustomColor,
    });
}

export async function DELETE() {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.user.delete({
        where: { id: userId },
    });

    return NextResponse.json({ message: "Account deleted" });
}
