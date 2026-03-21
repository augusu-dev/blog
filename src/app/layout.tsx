import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import Providers from "@/components/Providers";
import { DEFAULT_LOCALE, normalizeLocale } from "@/lib/i18n";

const themeBootstrapScript = `
(() => {
  const THEME_KEY = "app-theme";
  const COLOR_KEY = "app-theme-custom-color";
  const DEFAULT_THEME = "default";
  const DEFAULT_COLOR = "#925c5c";
  const PRESET_THEMES = {
    default: { bg: "#fdfaf8", bgSoft: "#f4efed", card: "rgba(255, 255, 255, 0.85)", bgCard: "rgba(255, 255, 255, 0.85)", azuki: "#925c5c", azukiLight: "#c29999", azukiPale: "#eed8d3", azukiDeep: "#683e3e", text: "#3c2a2a", textSoft: "#846a6a", accent: "#cd7768", border: "rgba(238, 216, 211, 0.6)", white: "#ffffff" },
    lightblue: { bg: "#f5fbff", bgSoft: "#eaf3fb", card: "rgba(255, 255, 255, 0.86)", bgCard: "rgba(255, 255, 255, 0.86)", azuki: "#4f7da5", azukiLight: "#84a9c8", azukiPale: "#d2e3f3", azukiDeep: "#2e5679", text: "#253746", textSoft: "#5f778d", accent: "#6d9cc6", border: "rgba(210, 227, 243, 0.75)", white: "#ffffff" },
    sand: { bg: "#f7f2e8", bgSoft: "#ede4d5", card: "rgba(255, 252, 246, 0.88)", bgCard: "rgba(255, 252, 246, 0.88)", azuki: "#8d7356", azukiLight: "#b6a186", azukiPale: "#e4d5be", azukiDeep: "#5f4c34", text: "#3f3224", textSoft: "#78644f", accent: "#b2835b", border: "rgba(228, 213, 190, 0.75)", white: "#ffffff" },
    apricot: { bg: "#fff7f1", bgSoft: "#fce9dd", card: "rgba(255, 255, 255, 0.88)", bgCard: "rgba(255, 255, 255, 0.88)", azuki: "#b56b4f", azukiLight: "#d79a80", azukiPale: "#f0d3c3", azukiDeep: "#7f442f", text: "#4a2f24", textSoft: "#856152", accent: "#d88766", border: "rgba(240, 211, 195, 0.75)", white: "#ffffff" },
    white: { bg: "#ffffff", bgSoft: "#f3f3f3", card: "rgba(255, 255, 255, 0.92)", bgCard: "rgba(255, 255, 255, 0.92)", azuki: "#606060", azukiLight: "#8b8b8b", azukiPale: "#d9d9d9", azukiDeep: "#3f3f3f", text: "#1f1f1f", textSoft: "#606060", accent: "#767676", border: "rgba(210, 210, 210, 0.8)", white: "#ffffff" },
    black: { bg: "#141414", bgSoft: "#1e1e1e", card: "rgba(28, 28, 28, 0.92)", bgCard: "rgba(28, 28, 28, 0.92)", azuki: "#d9d0c7", azukiLight: "#bdb4ac", azukiPale: "#5f5851", azukiDeep: "#f2e8de", text: "#f1ece7", textSoft: "#c8beb5", accent: "#cfb8a1", border: "rgba(120, 112, 103, 0.6)", white: "#ffffff" }
  };

  const normalizeHex = (value) => {
    const match = String(value || "").trim().match(/^#?([0-9a-fA-F]{6})$/);
    return match ? "#" + match[1].toLowerCase() : DEFAULT_COLOR;
  };
  const hexToRgb = (value) => {
    const hex = normalizeHex(value).slice(1);
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  };
  const rgbToHex = (r, g, b) => "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, ratio) => {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    return rgbToHex(ar + (br - ar) * ratio, ag + (bg - ag) * ratio, ab + (bb - ab) * ratio);
  };
  const luminance = (hex) => {
    const [r, g, b] = hexToRgb(hex).map((x) => x / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const buildCustomTheme = (baseHex) => {
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
        white: "#ffffff"
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
      border: mix(base, "#ffffff", 0.65) + "99",
      white: "#ffffff"
    };
  };

  const readStoredValue = (baseKey) => {
    const direct = localStorage.getItem(baseKey);
    if (direct) {
      return direct;
    }
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(baseKey + ":")) {
        const value = localStorage.getItem(key);
        if (value) {
          return value;
        }
      }
    }
    return "";
  };

  const theme = readStoredValue(THEME_KEY) || DEFAULT_THEME;
  const customColor = readStoredValue(COLOR_KEY) || DEFAULT_COLOR;
  const vars = theme === "custom" ? buildCustomTheme(customColor) : (PRESET_THEMES[theme] || PRESET_THEMES.default);
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
})();
`;

export const metadata: Metadata = {
    title: "Next Blog",
    description: "Next Blog",
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://nextblog-au.vercel.app"),
    openGraph: {
        title: "Next Blog",
        description: "Next Blog",
        url: "https://blog.augusu.dev",
        siteName: "Next Blog",
        locale: "ja_JP",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Next Blog",
        description: "Next Blog",
    },
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const headerStore = await headers();
    const locale = normalizeLocale(headerStore.get("x-app-locale") || DEFAULT_LOCALE);

    return (
        <html lang={locale}>
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
            </head>
            <body>
                <Providers initialLocale={locale}>{children}</Providers>
            </body>
        </html>
    );
}
