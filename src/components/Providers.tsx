"use client";

import { SessionProvider } from "next-auth/react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import type { Locale } from "@/lib/i18n";

export default function Providers({
    children,
    initialLocale,
}: {
    children: React.ReactNode;
    initialLocale: Locale;
}) {
    return (
        <SessionProvider>
            <ThemeProvider>
                <LanguageProvider initialLocale={initialLocale}>
                    {children}
                    <LanguageSwitcher />
                </LanguageProvider>
            </ThemeProvider>
        </SessionProvider>
    );
}
