"use client";

import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

export type ThemeName = "default" | "lightblue" | "sand" | "apricot" | "white" | "black" | "custom";

type ThemeVars = {
    bg: string;
    bgSoft: string;
    card: string;
    bgCard: string;
    azuki: string;
    azukiLight: string;
    azukiPale: string;
    azukiDeep: string;
    text: string;
    textSoft: string;
    accent: string;
    border: string;
    white: string;
};

const STORAGE_THEME_KEY = "app-theme";
const STORAGE_CUSTOM_COLOR_KEY = "app-theme-custom-color";
const DEFAULT_THEME: ThemeName = "default";
const DEFAULT_CUSTOM_COLOR = "#925c5c";

const PRESET_THEMES: Record<Exclude<ThemeName, "custom">, ThemeVars> = {
    default: {
        bg: "#fdfaf8",
        bgSoft: "#f4efed",
        card: "rgba(255, 255, 255, 0.85)",
        bgCard: "rgba(255, 255, 255, 0.85)",
        azuki: "#925c5c",
        azukiLight: "#c29999",
        azukiPale: "#eed8d3",
        azukiDeep: "#683e3e",
        text: "#3c2a2a",
        textSoft: "#846a6a",
        accent: "#cd7768",
        border: "rgba(238, 216, 211, 0.6)",
        white: "#ffffff",
    },
    lightblue: {
        bg: "#f5fbff",
        bgSoft: "#eaf3fb",
        card: "rgba(255, 255, 255, 0.86)",
        bgCard: "rgba(255, 255, 255, 0.86)",
        azuki: "#4f7da5",
        azukiLight: "#84a9c8",
        azukiPale: "#d2e3f3",
        azukiDeep: "#2e5679",
        text: "#253746",
        textSoft: "#5f778d",
        accent: "#6d9cc6",
        border: "rgba(210, 227, 243, 0.75)",
        white: "#ffffff",
    },
    sand: {
        bg: "#f7f2e8",
        bgSoft: "#ede4d5",
        card: "rgba(255, 252, 246, 0.88)",
        bgCard: "rgba(255, 252, 246, 0.88)",
        azuki: "#8d7356",
        azukiLight: "#b6a186",
        azukiPale: "#e4d5be",
        azukiDeep: "#5f4c34",
        text: "#3f3224",
        textSoft: "#78644f",
        accent: "#b2835b",
        border: "rgba(228, 213, 190, 0.75)",
        white: "#ffffff",
    },
    apricot: {
        bg: "#fff7f1",
        bgSoft: "#fce9dd",
        card: "rgba(255, 255, 255, 0.88)",
        bgCard: "rgba(255, 255, 255, 0.88)",
        azuki: "#b56b4f",
        azukiLight: "#d79a80",
        azukiPale: "#f0d3c3",
        azukiDeep: "#7f442f",
        text: "#4a2f24",
        textSoft: "#856152",
        accent: "#d88766",
        border: "rgba(240, 211, 195, 0.75)",
        white: "#ffffff",
    },
    white: {
        bg: "#ffffff",
        bgSoft: "#f3f3f3",
        card: "rgba(255, 255, 255, 0.92)",
        bgCard: "rgba(255, 255, 255, 0.92)",
        azuki: "#606060",
        azukiLight: "#8b8b8b",
        azukiPale: "#d9d9d9",
        azukiDeep: "#3f3f3f",
        text: "#1f1f1f",
        textSoft: "#606060",
        accent: "#767676",
        border: "rgba(210, 210, 210, 0.8)",
        white: "#ffffff",
    },
    black: {
        bg: "#141414",
        bgSoft: "#1e1e1e",
        card: "rgba(28, 28, 28, 0.92)",
        bgCard: "rgba(28, 28, 28, 0.92)",
        azuki: "#d9d0c7",
        azukiLight: "#bdb4ac",
        azukiPale: "#5f5851",
        azukiDeep: "#f2e8de",
        text: "#f1ece7",
        textSoft: "#c8beb5",
        accent: "#cfb8a1",
        border: "rgba(120, 112, 103, 0.6)",
        white: "#ffffff",
    },
};

function clampColor(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHex(value: string): string {
    const cleaned = value.trim();
    const match = cleaned.match(/^#?([0-9a-fA-F]{6})$/);
    return match ? `#${match[1].toLowerCase()}` : DEFAULT_CUSTOM_COLOR;
}

function hexToRgb(value: string): [number, number, number] {
    const hex = normalizeHex(value).slice(1);
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
    ];
}

function rgbToHex(r: number, g: number, b: number): string {
    return `#${clampColor(r).toString(16).padStart(2, "0")}${clampColor(g).toString(16).padStart(2, "0")}${clampColor(b).toString(16).padStart(2, "0")}`;
}

function mix(hexA: string, hexB: string, ratio: number): string {
    const [ar, ag, ab] = hexToRgb(hexA);
    const [br, bg, bb] = hexToRgb(hexB);
    const r = ar + (br - ar) * ratio;
    const g = ag + (bg - ag) * ratio;
    const b = ab + (bb - ab) * ratio;
    return rgbToHex(r, g, b);
}

function luminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex).map((x) => x / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function buildCustomTheme(baseHex: string): ThemeVars {
    const base = normalizeHex(baseHex);
    const darkMode = luminance(base) < 0.34;

    if (darkMode) {
        return {
            bg: mix(base, "#000000", 0.82),
            bgSoft: mix(base, "#000000", 0.72),
            card: "rgba(24, 24, 24, 0.9)",
            bgCard: "rgba(24, 24, 24, 0.9)",
            azuki: mix(base, "#ffffff", 0.28),
            azukiLight: mix(base, "#ffffff", 0.45),
            azukiPale: mix(base, "#ffffff", 0.18),
            azukiDeep: mix(base, "#ffffff", 0.55),
            text: "#f1ece7",
            textSoft: "#c8beb5",
            accent: mix(base, "#ffffff", 0.4),
            border: "rgba(130, 130, 130, 0.45)",
            white: "#ffffff",
        };
    }

    return {
        bg: mix(base, "#ffffff", 0.94),
        bgSoft: mix(base, "#ffffff", 0.86),
        card: "rgba(255, 255, 255, 0.88)",
        bgCard: "rgba(255, 255, 255, 0.88)",
        azuki: base,
        azukiLight: mix(base, "#ffffff", 0.35),
        azukiPale: mix(base, "#ffffff", 0.7),
        azukiDeep: mix(base, "#000000", 0.35),
        text: "#2d2621",
        textSoft: mix(base, "#000000", 0.25),
        accent: mix(base, "#ffffff", 0.2),
        border: `${mix(base, "#ffffff", 0.65)}99`,
        white: "#ffffff",
    };
}

function applyThemeVars(vars: ThemeVars): void {
    const root = document.documentElement;
    root.style.setProperty("--bg", vars.bg);
    root.style.setProperty("--bg-soft", vars.bgSoft);
    root.style.setProperty("--card", vars.card);
    root.style.setProperty("--bg-card", vars.bgCard);
    root.style.setProperty("--azuki", vars.azuki);
    root.style.setProperty("--azuki-light", vars.azukiLight);
    root.style.setProperty("--azuki-pale", vars.azukiPale);
    root.style.setProperty("--azuki-deep", vars.azukiDeep);
    root.style.setProperty("--text", vars.text);
    root.style.setProperty("--text-soft", vars.textSoft);
    root.style.setProperty("--accent", vars.accent);
    root.style.setProperty("--border", vars.border);
    root.style.setProperty("--white", vars.white);
}

function getThemeStorageKey(userRef: string): string {
    return `${STORAGE_THEME_KEY}:${userRef}`;
}

function getCustomColorStorageKey(userRef: string): string {
    return `${STORAGE_CUSTOM_COLOR_KEY}:${userRef}`;
}

function getSessionThemeUserRef(
    session: ReturnType<typeof useSession>["data"]
): string | null {
    const sessionUser = session?.user as { id?: string | null; userId?: string | null } | undefined;
    const publicUserId = typeof sessionUser?.userId === "string" ? sessionUser.userId.trim() : "";
    if (publicUserId) {
        return publicUserId;
    }
    const userId = typeof sessionUser?.id === "string" ? sessionUser.id.trim() : "";
    return userId || null;
}

function readStoredTheme(userRef: string): { theme: ThemeName; customColor: string } | null {
    if (typeof window === "undefined") return null;

    const storedTheme =
        localStorage.getItem(getThemeStorageKey(userRef)) || localStorage.getItem(STORAGE_THEME_KEY);
    const storedColor =
        localStorage.getItem(getCustomColorStorageKey(userRef)) || localStorage.getItem(STORAGE_CUSTOM_COLOR_KEY);
    const parsedTheme = parseThemeName(storedTheme);
    const parsedColor = parseThemeColor(storedColor) || DEFAULT_CUSTOM_COLOR;

    if (!parsedTheme && !storedColor) {
        return null;
    }

    return {
        theme: parsedTheme || DEFAULT_THEME,
        customColor: parsedColor,
    };
}

function writeStoredTheme(userRef: string, theme: ThemeName, customColor: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(getThemeStorageKey(userRef), theme);
    localStorage.setItem(getCustomColorStorageKey(userRef), customColor);
    localStorage.setItem(STORAGE_THEME_KEY, theme);
    localStorage.setItem(STORAGE_CUSTOM_COLOR_KEY, customColor);
}

type ThemeContextType = {
    theme: ThemeName;
    customColor: string;
    committedTheme: ThemeName;
    committedCustomColor: string;
    setTheme: (nextTheme: ThemeName) => void;
    setCustomColor: (nextColor: string) => void;
    commitTheme: (nextTheme?: ThemeName, nextColor?: string) => void;
    resetTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const { data: session, status } = useSession();
    const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);
    const [customColor, setCustomColorState] = useState(DEFAULT_CUSTOM_COLOR);
    const [committedTheme, setCommittedTheme] = useState<ThemeName>(DEFAULT_THEME);
    const [committedCustomColor, setCommittedCustomColor] = useState(DEFAULT_CUSTOM_COLOR);
    const serverThemeRequestedUserRef = useRef<string | null>(null);

    useEffect(() => {
        const themeVars = theme === "custom" ? buildCustomTheme(customColor) : PRESET_THEMES[theme];
        applyThemeVars(themeVars);
    }, [theme, customColor]);

    useEffect(() => {
        const userRef = getSessionThemeUserRef(session);

        if (status === "unauthenticated") {
            serverThemeRequestedUserRef.current = null;
            queueMicrotask(() => {
                setThemeState(DEFAULT_THEME);
                setCustomColorState(DEFAULT_CUSTOM_COLOR);
                setCommittedTheme(DEFAULT_THEME);
                setCommittedCustomColor(DEFAULT_CUSTOM_COLOR);
            });
            return;
        }

        if (status !== "authenticated" || !userRef) {
            return;
        }

        const cachedTheme = readStoredTheme(userRef);
        if (cachedTheme) {
            queueMicrotask(() => {
                setThemeState(cachedTheme.theme);
                setCustomColorState(cachedTheme.customColor);
                setCommittedTheme(cachedTheme.theme);
                setCommittedCustomColor(cachedTheme.customColor);
            });
            serverThemeRequestedUserRef.current = userRef;
            return;
        }

        if (serverThemeRequestedUserRef.current === userRef) {
            return;
        }

        serverThemeRequestedUserRef.current = userRef;

        void (async () => {
            const res = await fetch("/api/user/settings", { cache: "no-store" });
            const data = await res.json().catch(() => ({} as { theme?: unknown; themeCustomColor?: unknown }));
            if (!res.ok) return;

            const nextTheme = (parseThemeName(data.theme) || DEFAULT_THEME) as ThemeName;
            const nextColor = parseThemeColor(data.themeCustomColor) || DEFAULT_CUSTOM_COLOR;

            setThemeState(nextTheme);
            setCustomColorState(nextColor);
            setCommittedTheme(nextTheme);
            setCommittedCustomColor(nextColor);
            writeStoredTheme(userRef, nextTheme, nextColor);
        })();
    }, [session, status]);

    const setTheme = (nextTheme: ThemeName) => {
        setThemeState(nextTheme);
    };

    const setCustomColor = (nextColor: string) => {
        const normalized = normalizeHex(nextColor);
        setCustomColorState(normalized);
    };

    const commitTheme = (nextTheme = theme, nextColor = customColor) => {
        const normalizedColor = normalizeHex(nextColor);
        setThemeState(nextTheme);
        setCustomColorState(normalizedColor);
        setCommittedTheme(nextTheme);
        setCommittedCustomColor(normalizedColor);
        const userRef = getSessionThemeUserRef(session);
        if (userRef) {
            writeStoredTheme(userRef, nextTheme, normalizedColor);
        }
    };

    const resetTheme = () => {
        setThemeState(committedTheme);
        setCustomColorState(committedCustomColor);
    };

    const value = {
        theme,
        customColor,
        committedTheme,
        committedCustomColor,
        setTheme,
        setCustomColor,
        commitTheme,
        resetTheme,
    };

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
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

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
