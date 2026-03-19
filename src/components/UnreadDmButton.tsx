"use client";

import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getDmUnreadRefreshEventName, getDmUnreadSince } from "@/lib/dmUnreadClient";
import { writeSessionCache } from "@/lib/clientSessionCache";

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
    const warmedThreadsForRef = useRef("");

    const refreshUnread = useCallback(async () => {
        if (status !== "authenticated" || !currentUserId) {
            setUnreadCount(0);
            return;
        }

        const since = getDmUnreadSince(currentUserId);
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
            // Keep the previous unread badge when polling fails.
        }
    }, [currentUserId, status]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const refreshEvent = getDmUnreadRefreshEventName();
        const onRefresh = () => {
            void refreshUnread();
        };

        const initTimer = window.setTimeout(onRefresh, 0);
        const timer = window.setInterval(onRefresh, 5000); // Poll every 5 seconds for less lag
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

    useEffect(() => {
        if (status !== "authenticated" || !currentUserId) {
            warmedThreadsForRef.current = "";
            return;
        }
        if (warmedThreadsForRef.current === currentUserId) {
            return;
        }

        warmedThreadsForRef.current = currentUserId;
        const timer = window.setTimeout(() => {
            void fetch("/api/direct-messages?mode=threads", {
                cache: "no-store",
                credentials: "same-origin",
            })
                .then((res) => res.json().then((payload) => ({ ok: res.ok, payload })))
                .then(({ ok, payload }) => {
                    if (!ok || !payload || !Array.isArray(payload.threads)) {
                        return;
                    }
                    writeSessionCache(`dm-threads-cache:${currentUserId}`, payload.threads);
                    const topThreadIds = payload.threads
                        .map((thread: { id?: unknown }) => (typeof thread?.id === "string" ? thread.id : ""))
                        .filter(Boolean)
                        .slice(0, 2);
                    void Promise.all(
                        topThreadIds.map(async (threadId: string) => {
                            try {
                                const threadRes = await fetch(
                                    `/api/direct-messages?mode=thread&userId=${encodeURIComponent(threadId)}`,
                                    {
                                        cache: "no-store",
                                        credentials: "same-origin",
                                    }
                                );
                                const threadPayload = await threadRes.json().catch(() => null);
                                if (!threadRes.ok || !threadPayload || !Array.isArray(threadPayload.messages)) {
                                    return;
                                }
                                writeSessionCache(
                                    `dm-thread-cache:${currentUserId}:${threadId}`,
                                    threadPayload.messages
                                );
                            } catch {
                                // Ignore background warm-up failures.
                            }
                        })
                    );
                })
                .catch(() => {
                    // Ignore background warm-up failures.
                });
        }, 180);

        return () => {
            window.clearTimeout(timer);
        };
    }, [currentUserId, session, status]);

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
