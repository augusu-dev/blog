"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import zh from "@/messages/zh.json";
import {
    buildLocalizedPath,
    DEFAULT_LOCALE,
    getLocaleFromPathname,
    LANGUAGE_COOKIE_NAME,
    normalizeLocale,
    type Locale,
} from "@/lib/i18n";

interface Dictionary {
    [key: string]: string | Dictionary;
}

const DICTIONARIES: Record<Locale, Dictionary> = {
    ja,
    en,
    zh,
};

function resolveMessage(dictionary: Dictionary, key: string): string | null {
    const segments = key.split(".");
    let current: string | Dictionary | undefined = dictionary;

    for (const segment of segments) {
        if (!current || typeof current === "string") {
            return null;
        }
        current = current[segment];
    }

    return typeof current === "string" ? current : null;
}

function writeLocaleCookie(locale: Locale): void {
    if (typeof document === "undefined") return;
    document.cookie = `${LANGUAGE_COOKIE_NAME}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

type LanguageContextType = {
    language: Locale;
    setLanguage: (locale: Locale) => void;
    t: (key: string, fallback?: string) => string;
    localizePath: (path: string) => string;
    buildLanguagePath: (locale: Locale, path?: string) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({
    children,
    initialLocale = DEFAULT_LOCALE,
}: {
    children: ReactNode;
    initialLocale?: Locale;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const currentPath = useMemo(() => {
        const query = searchParams.toString();
        return `${pathname || "/"}${query ? `?${query}` : ""}`;
    }, [pathname, searchParams]);

    const detectedLocale = normalizeLocale(getLocaleFromPathname(pathname) || initialLocale);
    const [language, setLanguageState] = useState<Locale>(detectedLocale);

    useEffect(() => {
        setLanguageState(detectedLocale);
    }, [detectedLocale]);

    const setLanguage = useCallback(
        (locale: Locale) => {
            writeLocaleCookie(locale);
            setLanguageState(locale);
            router.replace(buildLocalizedPath(currentPath, locale));
        },
        [currentPath, router]
    );

    const t = useCallback(
        (key: string, fallback?: string) =>
            resolveMessage(DICTIONARIES[language], key) ||
            resolveMessage(DICTIONARIES[language], `legacy.${key}`) ||
            fallback ||
            key,
        [language]
    );

    const localizePath = useCallback(
        (path: string) => buildLocalizedPath(path, language),
        [language]
    );

    const buildLanguagePath = useCallback(
        (locale: Locale, path?: string) => buildLocalizedPath(path || currentPath, locale),
        [currentPath]
    );

    return (
        <LanguageContext.Provider
            value={{
                language,
                setLanguage,
                t,
                localizePath,
                buildLanguagePath,
            }}
        >
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error("useLanguage must be used within a LanguageProvider");
    }
    return context;
}
