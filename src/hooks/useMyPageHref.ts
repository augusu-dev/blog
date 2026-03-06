"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

function buildMyPageHref(rawPublicUserId?: string | null, rawUserId?: string | null) {
    const publicUserId = typeof rawPublicUserId === "string" ? rawPublicUserId.trim() : "";
    if (publicUserId) {
        return `/user/${encodeURIComponent(publicUserId)}`;
    }

    const userId = typeof rawUserId === "string" ? rawUserId.trim() : "";
    return userId ? `/user/${encodeURIComponent(userId)}` : "/settings";
}

export function useMyPageHref(): string {
    const { data: session, status } = useSession();
    const sessionUser = session?.user as { id?: string | null; userId?: string | null } | undefined;
    const fallbackHref = useMemo(
        () => buildMyPageHref(null, sessionUser?.id),
        [sessionUser?.id]
    );
    const [href, setHref] = useState(fallbackHref);

    useEffect(() => {
        setHref(fallbackHref);
    }, [fallbackHref]);

    useEffect(() => {
        if (status !== "authenticated") return;

        let active = true;

        const resolveHref = async () => {
            try {
                const res = await fetch("/api/user/settings", { cache: "no-store" });
                const payload = await res.json().catch(() => ({} as { id?: string | null; userId?: string | null }));
                if (!active || !res.ok) return;

                const nextHref = buildMyPageHref(payload.userId, payload.id);
                if (nextHref) {
                    setHref(nextHref);
                }
            } catch {
                // Keep the id-based fallback.
            }
        };

        void resolveHref();

        return () => {
            active = false;
        };
    }, [status]);

    return href;
}
