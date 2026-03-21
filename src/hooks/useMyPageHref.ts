"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { resolveClientPublicUserId } from "@/lib/clientPublicUserId";

function buildMyPageHref(rawPublicUserId?: string | null) {
    const publicUserId = typeof rawPublicUserId === "string" ? rawPublicUserId.trim() : "";
    if (publicUserId) {
        return `/user/${encodeURIComponent(publicUserId)}`;
    }
    return "/settings";
}

export function useMyPageHref(): string {
    const { data: session, status } = useSession();
    const { localizePath } = useLanguage();
    const sessionUser = session?.user as { id?: string | null; userId?: string | null } | undefined;
    const fallbackHref = useMemo(
        () => localizePath(buildMyPageHref(resolveClientPublicUserId(sessionUser?.id, sessionUser?.userId))),
        [localizePath, sessionUser?.id, sessionUser?.userId]
    );
    const [href, setHref] = useState(fallbackHref);

    useEffect(() => {
        setHref(fallbackHref);
    }, [fallbackHref]);

    useEffect(() => {
        if (status !== "authenticated" || typeof window === "undefined") return;

        const syncHref = () => {
            setHref(localizePath(buildMyPageHref(resolveClientPublicUserId(sessionUser?.id, sessionUser?.userId))));
        };

        syncHref();
        window.addEventListener("storage", syncHref);

        return () => {
            window.removeEventListener("storage", syncHref);
        };
    }, [localizePath, sessionUser?.id, sessionUser?.userId, status]);

    return href;
}
