import type { Metadata } from "next";
import { buildLocalizedPath, LOCALES, normalizeLocale } from "@/lib/i18n";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nextblog-au.vercel.app";

export function buildLocaleMetadata(path: string, localeInput: string): Metadata {
    const locale = normalizeLocale(localeInput);
    const languages = Object.fromEntries(
        LOCALES.map((candidate) => [candidate, `${SITE_URL}${buildLocalizedPath(path, candidate)}`])
    );

    return {
        alternates: {
            canonical: `${SITE_URL}${buildLocalizedPath(path, locale)}`,
            languages: {
                ...languages,
                "x-default": `${SITE_URL}${buildLocalizedPath(path, "ja")}`,
            },
        },
    };
}
