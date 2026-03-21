"use client";

import { CSSProperties, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getDmUnreadRefreshEventName } from "@/lib/dmUnreadClient";

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
    const { data: session, status } = useSession();
    const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? "";
    const [unreadCount, setUnreadCount] = useState(0);

    const refreshUnread = useCallback(async () => {
        if (status !== "authenticated" || !currentUserId) {
            setUnreadCount(0);
            return;
        }

        try {
            const res = await fetch("/api/notifications/unread", { cache: "no-store" });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) return;
            const total = Number(payload.total || 0);
            setUnreadCount(Number.isFinite(total) && total > 0 ? total : 0);
        } catch {
            // Keep the previous unread badge when polling fails.
        }
    }, [currentUserId, status]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const refreshEvent = getDmUnreadRefreshEventName();
        const onRefresh = () => {
            if (document.hidden) return;
            void refreshUnread();
        };

        const initTimer = window.setTimeout(onRefresh, 0);
        const timer = window.setInterval(onRefresh, 15000);
        window.addEventListener(refreshEvent, onRefresh);
        window.addEventListener("storage", onRefresh);
        window.addEventListener("focus", onRefresh);

        return () => {
            window.clearTimeout(initTimer);
            window.clearInterval(timer);
            window.removeEventListener(refreshEvent, onRefresh);
            window.removeEventListener("storage", onRefresh);
            window.removeEventListener("focus", onRefresh);
        };
    }, [refreshUnread]);

    return (
        <Link
            href={href}
            className={`${className} dm-nav-link`.trim()}
            style={{ textDecoration: "none", ...style }}
            title={title}
            aria-label={unreadCount > 0 ? `${title} (${unreadCount})` : title}
        >
            <span
                aria-hidden="true"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 0,
                }}
            >
                <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
                    <path d="m22 8-8.97 6.35a1.8 1.8 0 0 1-2.06 0L2 8" />
                </svg>
            </span>
            {unreadCount > 0 ? (
                <span
                    className="dm-unread-badge"
                    style={{
                        fontSize: "9px",
                        fontWeight: "bold",
                        backgroundColor: "#e84545",
                        color: "white",
                        borderRadius: "10px",
                        padding: "2px 5px",
                        lineHeight: "1",
                    }}
                >
                    {unreadCount > MAX_BADGE ? `${MAX_BADGE}+` : unreadCount}
                </span>
            ) : null}
        </Link>
    );
}
