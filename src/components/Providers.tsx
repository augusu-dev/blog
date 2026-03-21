"use client";

import { SessionProvider } from "next-auth/react";
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
                </LanguageProvider>
            </ThemeProvider>
        </SessionProvider>
    );
}
