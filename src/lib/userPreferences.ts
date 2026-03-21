export type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";
export type ThemeName = "default" | "lightblue" | "sand" | "apricot" | "white" | "black" | "custom";

export const DEFAULT_DM_SETTING: DmSetting = "OPEN";
export const DEFAULT_THEME: ThemeName = "default";
export const DEFAULT_THEME_CUSTOM_COLOR = "#925c5c";

export type UserPreferences = {
    links: unknown[];
    dmSetting: DmSetting;
    theme: ThemeName;
    themeCustomColor: string;
    dmLastSeenAt: string | null;
};

function parseDmSetting(value: unknown): DmSetting | null {
    if (value === "OPEN" || value === "PR_ONLY" || value === "CLOSED") {
        return value;
    }
    return null;
}

function parseThemeName(value: unknown): ThemeName | null {
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
    return null;
}

function parseThemeColor(value: unknown): string | null {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
        return null;
    }

    return `#${trimmed.replace(/^#/, "").toLowerCase()}`;
}

function normalizeSeenAt(value: unknown): string | null {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed.toISOString();
}

export function parseUserPreferences(raw: string | null | undefined): UserPreferences {
    if (!raw) {
        return {
            links: [],
            dmSetting: DEFAULT_DM_SETTING,
            theme: DEFAULT_THEME,
            themeCustomColor: DEFAULT_THEME_CUSTOM_COLOR,
            dmLastSeenAt: null,
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
                dmLastSeenAt: null,
            };
        }

        if (parsed && typeof parsed === "object") {
            const candidate = parsed as {
                items?: unknown;
                links?: unknown;
                dmSetting?: unknown;
                theme?: unknown;
                themeCustomColor?: unknown;
                dmLastSeenAt?: unknown;
            };

            return {
                links: Array.isArray(candidate.items)
                    ? candidate.items
                    : Array.isArray(candidate.links)
                      ? candidate.links
                      : [],
                dmSetting: parseDmSetting(candidate.dmSetting) || DEFAULT_DM_SETTING,
                theme: parseThemeName(candidate.theme) || DEFAULT_THEME,
                themeCustomColor: parseThemeColor(candidate.themeCustomColor) || DEFAULT_THEME_CUSTOM_COLOR,
                dmLastSeenAt: normalizeSeenAt(candidate.dmLastSeenAt),
            };
        }
    } catch {
        // Fall through to defaults.
    }

    return {
        links: [],
        dmSetting: DEFAULT_DM_SETTING,
        theme: DEFAULT_THEME,
        themeCustomColor: DEFAULT_THEME_CUSTOM_COLOR,
        dmLastSeenAt: null,
    };
}

export function serializeUserPreferences(preferences: UserPreferences): string {
    const dmLastSeenAt = normalizeSeenAt(preferences.dmLastSeenAt);
    const normalizedLinks = Array.isArray(preferences.links) ? preferences.links : [];

    if (
        preferences.dmSetting === DEFAULT_DM_SETTING &&
        preferences.theme === DEFAULT_THEME &&
        preferences.themeCustomColor === DEFAULT_THEME_CUSTOM_COLOR &&
        !dmLastSeenAt
    ) {
        return JSON.stringify(normalizedLinks);
    }

    return JSON.stringify({
        items: normalizedLinks,
        dmSetting: preferences.dmSetting,
        theme: preferences.theme,
        themeCustomColor: preferences.themeCustomColor,
        ...(dmLastSeenAt ? { dmLastSeenAt } : {}),
    });
}
