"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
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
    const sessionUser = session?.user as { id?: string | null; userId?: string | null } | undefined;
    const fallbackHref = useMemo(
        () => buildMyPageHref(resolveClientPublicUserId(sessionUser?.id, sessionUser?.userId)),
        [sessionUser?.id, sessionUser?.userId]
    );
    const [href, setHref] = useState(fallbackHref);

    useEffect(() => {
        setHref(fallbackHref);
    }, [fallbackHref]);

    useEffect(() => {
        if (status !== "authenticated" || typeof window === "undefined") return;

        const syncHref = () => {
            setHref(buildMyPageHref(resolveClientPublicUserId(sessionUser?.id, sessionUser?.userId)));
        };

        syncHref();
        window.addEventListener("storage", syncHref);

        return () => {
            window.removeEventListener("storage", syncHref);
        };
    }, [sessionUser?.id, sessionUser?.userId, status]);

    return href;
}
