"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { LOCALES } from "@/lib/i18n";

export default function LanguageSwitcher() {
    const { language, setLanguage, t } = useLanguage();

    return (
        <div
            aria-label={t("switcher.label")}
            style={{
                position: "fixed",
                right: 12,
                bottom: 12,
                zIndex: 120,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: 6,
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--card)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                backdropFilter: "blur(14px)",
            }}
        >
            {LOCALES.map((locale) => {
                const active = locale === language;
                return (
                    <button
                        key={locale}
                        type="button"
                        onClick={() => setLanguage(locale)}
                        aria-pressed={active}
                        title={t(`switcher.localeNames.${locale}`)}
                        style={{
                            border: "1px solid transparent",
                            borderColor: active ? "var(--azuki)" : "var(--border)",
                            background: active ? "var(--azuki)" : "transparent",
                            color: active ? "var(--white)" : "var(--text)",
                            borderRadius: 999,
                            padding: "6px 10px",
                            fontSize: 12,
                            lineHeight: 1,
                            cursor: "pointer",
                            minWidth: 44,
                        }}
                    >
                        {locale.toUpperCase()}
                    </button>
                );
            })}
        </div>
    );
}
