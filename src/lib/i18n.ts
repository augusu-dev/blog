export const LOCALES = ["ja", "en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ja";
export const LANGUAGE_COOKIE_NAME = "preferred-locale";

export function isLocale(value: string | null | undefined): value is Locale {
    return !!value && LOCALES.includes(value as Locale);
}

export function normalizeLocale(value: string | null | undefined): Locale {
    return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function getLocaleFromPathname(pathname: string | null | undefined): Locale | null {
    if (!pathname) return null;

    const segments = pathname.split("/");
    const candidate = segments[1] || "";
    return isLocale(candidate) ? candidate : null;
}

export function stripLocaleFromPathname(pathname: string | null | undefined): string {
    if (!pathname) return "/";

    const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const segments = normalized.split("/");

    if (isLocale(segments[1] || "")) {
        const rest = segments.slice(2).join("/");
        return rest ? `/${rest}` : "/";
    }

    return normalized;
}

function splitPathSuffix(path: string): { pathname: string; suffix: string } {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const hashIndex = normalized.indexOf("#");
    const queryIndex = normalized.indexOf("?");
    const cutIndex =
        hashIndex === -1
            ? queryIndex
            : queryIndex === -1
                ? hashIndex
                : Math.min(hashIndex, queryIndex);

    if (cutIndex === -1) {
        return { pathname: normalized, suffix: "" };
    }

    return {
        pathname: normalized.slice(0, cutIndex) || "/",
        suffix: normalized.slice(cutIndex),
    };
}

export function buildLocalizedPath(path: string, locale: Locale): string {
    if (!path) {
        return `/${locale}`;
    }

    if (
        !path.startsWith("/") ||
        path.startsWith("/api") ||
        path.startsWith("/_next") ||
        path.startsWith("/images") ||
        path.startsWith("/favicon")
    ) {
        return path;
    }

    const { pathname, suffix } = splitPathSuffix(path);
    const strippedPath = stripLocaleFromPathname(pathname);

    if (strippedPath === "/") {
        return `/${locale}${suffix}`;
    }

    return `/${locale}${strippedPath}${suffix}`;
}

export function getLocaleDisplayName(locale: Locale, currentLocale: Locale): string {
    const localeNames: Record<Locale, Record<Locale, string>> = {
        ja: {
            ja: "日本語",
            en: "英語",
            zh: "中国語",
        },
        en: {
            ja: "Japanese",
            en: "English",
            zh: "Chinese",
        },
        zh: {
            ja: "日文",
            en: "英文",
            zh: "中文",
        },
    };

    return localeNames[currentLocale][locale];
}

export function detectLocaleFromAcceptLanguage(headerValue: string | null | undefined): Locale {
    if (!headerValue) return DEFAULT_LOCALE;

    const values = headerValue
        .split(",")
        .map((entry) => entry.trim().split(";")[0]?.toLowerCase())
        .filter(Boolean);

    for (const value of values) {
        if (!value) continue;
        if (value.startsWith("zh")) return "zh";
        if (value.startsWith("en")) return "en";
        if (value.startsWith("ja")) return "ja";
    }

    return DEFAULT_LOCALE;
}

export function getPreferredLocale(options: {
    pathname?: string | null;
    cookieLocale?: string | null;
    acceptLanguage?: string | null;
}): Locale {
    const localeFromPath = getLocaleFromPathname(options.pathname);
    if (localeFromPath) return localeFromPath;

    if (isLocale(options.cookieLocale)) {
        return options.cookieLocale;
    }

    return detectLocaleFromAcceptLanguage(options.acceptLanguage);
}
