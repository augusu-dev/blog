/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type PinUser = {
    pinnedUserId: string;
    createdAt: string;
    pinnedUser: {
        id: string;
        userId?: string | null;
        name: string | null;
        email: string | null;
        image: string | null;
    };
};

type PinFeedPost = {
    id: string;
    title: string;
    content: string;
    excerpt: string | null;
    tags: string[];
    createdAt: string;
    authorId: string;
    author: {
        id: string;
        userId?: string | null;
        name: string | null;
        email: string | null;
        image: string | null;
    };
};

type FeedPayload = {
    pinnedCount: number;
    pinnedUsers: PinUser[];
    posts: PinFeedPost[];
};

const PINS_FEED_CACHE_KEY = "pins-feed-cache";
const PINS_FEED_CACHE_TTL_MS = 60 * 1000;

function authorLabel(author: { name: string | null; email: string | null }): string {
    return author.name || author.email || "Anonymous";
}

function authorHref(author: { id: string; userId?: string | null }): string {
    return `/user/${encodeURIComponent(author.userId || author.id)}`;
}

function postHref(post: PinFeedPost): string {
    return `/user/${encodeURIComponent(post.author.userId || post.author.id)}?post=${encodeURIComponent(post.id)}`;
}

function formatDateTime(value: string): string {
    try {
        return new Intl.DateTimeFormat("ja-JP", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(value));
    } catch {
        return value;
    }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readCachedFeed(): FeedPayload | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = sessionStorage.getItem(PINS_FEED_CACHE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as { savedAt?: unknown; payload?: FeedPayload };
        const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
        if (!parsed.payload || Date.now() - savedAt > PINS_FEED_CACHE_TTL_MS) {
            sessionStorage.removeItem(PINS_FEED_CACHE_KEY);
            return null;
        }

        return {
            pinnedCount: Number(parsed.payload.pinnedCount || 0),
            pinnedUsers: Array.isArray(parsed.payload.pinnedUsers) ? parsed.payload.pinnedUsers : [],
            posts: Array.isArray(parsed.payload.posts) ? parsed.payload.posts.slice(0, 15) : [],
        };
    } catch {
        return null;
    }
}

function writeCachedFeed(payload: FeedPayload): void {
    if (typeof window === "undefined") return;

    try {
        sessionStorage.setItem(
            PINS_FEED_CACHE_KEY,
            JSON.stringify({
                savedAt: Date.now(),
                payload,
            })
        );
    } catch {
        // Ignore cache write failures.
    }
}

export default function PinsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [loading, setLoading] = useState(false);
    const [deletingPinId, setDeletingPinId] = useState<string | null>(null);
    const [payload, setPayload] = useState<FeedPayload>({ pinnedCount: 0, pinnedUsers: [], posts: [] });
    const [error, setError] = useState("");
    const hasVisibleFeed = payload.pinnedUsers.length > 0 || payload.posts.length > 0;

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [router, status]);

    useEffect(() => {
        const cached = readCachedFeed();
        if (!cached) return;
        setPayload(cached);
    }, []);

    const loadFeed = useCallback(
        async (attempt = 0): Promise<void> => {
            if (status !== "authenticated" || !session?.user) return;

            if (!hasVisibleFeed || attempt > 0) {
                setLoading(true);
            }
            if (attempt === 0) {
                setError("");
            }

            try {
                const res = await fetch("/api/pins/feed", {
                    cache: "no-store",
                    credentials: "same-origin",
                });
                const data = (await res.json().catch(() => ({}))) as Partial<FeedPayload>;

                if (!res.ok) {
                    const shouldRetry = res.status === 401 || res.status >= 500;
                    if (shouldRetry && attempt < 1) {
                        await wait(160 * (attempt + 1));
                        await loadFeed(attempt + 1);
                        return;
                    }
                    setError("ピン中ユーザーの読み込みに失敗しました。");
                    return;
                }

                const nextPayload = {
                    pinnedCount: Number(data.pinnedCount || 0),
                    pinnedUsers: Array.isArray(data.pinnedUsers) ? (data.pinnedUsers as PinUser[]) : [],
                    posts: Array.isArray(data.posts) ? (data.posts as PinFeedPost[]).slice(0, 15) : [],
                };
                if (
                    nextPayload.pinnedUsers.length === 0 &&
                    nextPayload.posts.length === 0 &&
                    hasVisibleFeed
                ) {
                    setError("");
                    return;
                }
                setPayload(nextPayload);
                if (nextPayload.pinnedUsers.length > 0 || nextPayload.posts.length > 0) {
                    writeCachedFeed(nextPayload);
                }
                setError("");
            } catch {
                if (attempt < 1) {
                    await wait(160 * (attempt + 1));
                    await loadFeed(attempt + 1);
                    return;
                }
                setError("ピン中ユーザーの読み込みに失敗しました。");
            } finally {
                setLoading(false);
            }
        },
        [hasVisibleFeed, session?.user, status]
    );

    useEffect(() => {
        if (status === "authenticated" && session?.user) {
            void loadFeed();
        }
    }, [loadFeed, session?.user, status]);

    const unpinUser = async (targetUserId: string) => {
        if (!targetUserId || deletingPinId) return;
        if (!confirm("ピンを外しますか？")) return;

        setDeletingPinId(targetUserId);
        setError("");
        try {
            const res = await fetch(`/api/pins?userId=${encodeURIComponent(targetUserId)}`, {
                method: "DELETE",
                credentials: "same-origin",
            });
            const result = await res.json().catch(() => ({} as { error?: string }));
            if (!res.ok) {
                setError(result.error || "ピン解除に失敗しました。");
                return;
            }

            setPayload((current) => {
                const nextUsers = current.pinnedUsers.filter((row) => row.pinnedUserId !== targetUserId);
                const nextPosts = current.posts.filter((post) => post.authorId !== targetUserId);
                return {
                    pinnedCount: nextUsers.length,
                    pinnedUsers: nextUsers,
                    posts: nextPosts,
                };
            });
        } catch {
            setError("ピン解除に失敗しました。");
        } finally {
            setDeletingPinId(null);
        }
    };

    if (status === "loading") {
        return (
            <div className="login-container">
                <div className="login-card" style={{ textAlign: "center" }}>
                    <p style={{ color: "var(--text-soft)" }}>読み込み中...</p>
                </div>
            </div>
        );
    }

    if (!session?.user) return null;

    return (
        <>
            <nav className="navbar" style={{ justifyContent: "space-between" }}>
                <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>
                    <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                    Next Blog <span className="beta-badge">β</span>
                </Link>
                <div className="nav-auth">
                    <Link href="/" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                        ホームへ
                    </Link>
                </div>
            </nav>

            <div className="editor-container" style={{ maxWidth: 920 }}>
                {error ? <div className="login-message login-error" style={{ marginBottom: 12 }}>{error}</div> : null}

                <section style={{ marginBottom: 22 }}>
                    <h2 className="settings-section-title">ピン中ユーザー</h2>
                    {loading ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>読み込み中...</p>
                    ) : payload.pinnedUsers.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>まだピンしているユーザーはいません。</p>
                    ) : (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {payload.pinnedUsers.map((row) => (
                                <div
                                    key={row.pinnedUserId}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 8,
                                        border: "1px solid var(--border)",
                                        borderRadius: 999,
                                        background: "var(--card)",
                                        padding: "5px 10px",
                                    }}
                                >
                                    <Link href={authorHref(row.pinnedUser)} style={{ textDecoration: "none", color: "var(--text)" }}>
                                        {authorLabel(row.pinnedUser)}
                                    </Link>
                                    <button
                                        type="button"
                                        className="editor-btn editor-btn-secondary"
                                        style={{ fontSize: 11, padding: "2px 8px" }}
                                        onClick={() => void unpinUser(row.pinnedUserId)}
                                        disabled={deletingPinId === row.pinnedUserId}
                                    >
                                        {deletingPinId === row.pinnedUserId ? "解除中..." : "解除"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <p style={{ marginTop: 10, color: "var(--text-soft)", fontSize: 13 }}>
                        ピン中の人数: {payload.pinnedCount}
                    </p>
                </section>

                <section>
                    <h2 className="settings-section-title">新着記事 / プロダクト</h2>
                    {loading ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>読み込み中...</p>
                    ) : payload.posts.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>表示できる新着はありません。</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {payload.posts.map((post) => (
                                <article
                                    key={post.id}
                                    onClick={() => router.push(postHref(post))}
                                    style={{
                                        border: "1px solid var(--border)",
                                        borderRadius: 12,
                                        background: "var(--card)",
                                        padding: 14,
                                        cursor: "pointer",
                                    }}
                                >
                                    <h3 style={{ marginBottom: 6, fontSize: 18 }}>
                                        <Link
                                            href={postHref(post)}
                                            style={{ textDecoration: "none", color: "var(--text)" }}
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            {post.title}
                                        </Link>
                                    </h3>
                                    <p style={{ marginBottom: 6, fontSize: 12, color: "var(--text-soft)" }}>
                                        by{" "}
                                        <Link
                                            href={authorHref(post.author)}
                                            style={{ textDecoration: "none", color: "var(--azuki)" }}
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            {authorLabel(post.author)}
                                        </Link>
                                        {" ・ "}
                                        {formatDateTime(post.createdAt)}
                                    </p>
                                    {post.excerpt ? (
                                        <p style={{ marginBottom: 8, whiteSpace: "pre-wrap", fontSize: 14 }}>{post.excerpt}</p>
                                    ) : null}
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </>
    );
}
