"use client";

import { CSSProperties, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getDmUnreadRefreshEventName, getDmUnreadSince, markDmPrSeen } from "@/lib/dmUnreadClient";

type UnreadDmButtonProps = {
    href?: string;
    className?: string;
    style?: CSSProperties;
    title?: string;
};

const MAX_BADGE = 99;

export default function UnreadDmButton({
    href = "/messages",
    className = "",
    style,
    title = "DM",
}: UnreadDmButtonProps) {
    const { status } = useSession();
    const [unreadCount, setUnreadCount] = useState(0);

    const refreshUnread = useCallback(async () => {
        if (status !== "authenticated") {
            setUnreadCount(0);
            return;
        }

        const since = getDmUnreadSince();
        if (!since) {
            markDmPrSeen();
            setUnreadCount(0);
            return;
        }

        const url = since
            ? `/api/notifications/unread?since=${encodeURIComponent(since)}`
            : "/api/notifications/unread";

        try {
            const res = await fetch(url, { cache: "no-store" });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) return;
            const total = Number(payload.total || 0);
            setUnreadCount(Number.isFinite(total) && total > 0 ? total : 0);
        } catch {
            // keep previous badge value
        }
    }, [status]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const refreshEvent = getDmUnreadRefreshEventName();
        const onRefresh = () => {
            void refreshUnread();
        };

        const initTimer = window.setTimeout(onRefresh, 0);
        const timer = window.setInterval(onRefresh, 30000);
        window.addEventListener(refreshEvent, onRefresh);
        window.addEventListener("focus", onRefresh);

        return () => {
            window.clearTimeout(initTimer);
            window.clearInterval(timer);
            window.removeEventListener(refreshEvent, onRefresh);
            window.removeEventListener("focus", onRefresh);
        };
    }, [refreshUnread]);

    return (
        <Link
            href={href}
            className={`${className} dm-nav-link`.trim()}
            style={{ textDecoration: "none", ...style }}
            title={title}
        >
            ✉
            {unreadCount > 0 ? (
                <span className="dm-unread-badge">{unreadCount > MAX_BADGE ? `${MAX_BADGE}+` : unreadCount}</span>
            ) : null}
        </Link>
    );
}
