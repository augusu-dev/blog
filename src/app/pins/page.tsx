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

function authorLabel(author: { name: string | null; email: string | null }): string {
    return author.name || author.email || "Anonymous";
}

function authorHref(author: { id: string; userId?: string | null }): string {
    return `/user/${encodeURIComponent(author.userId || author.id)}`;
}

export default function PinsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [loading, setLoading] = useState(false);
    const [deletingPinId, setDeletingPinId] = useState<string | null>(null);
    const [payload, setPayload] = useState<FeedPayload>({ pinnedCount: 0, pinnedUsers: [], posts: [] });
    const [error, setError] = useState("");

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    const loadFeed = useCallback(async () => {
        if (!session?.user) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/pins/feed");
            const data = (await res.json().catch(() => ({}))) as Partial<FeedPayload & { error: string }>;
            if (!res.ok) {
                setError(data.error || "ピン新着の読み込みに失敗しました。");
                return;
            }
            setPayload({
                pinnedCount: Number(data.pinnedCount || 0),
                pinnedUsers: Array.isArray(data.pinnedUsers) ? (data.pinnedUsers as PinUser[]) : [],
                posts: Array.isArray(data.posts) ? (data.posts as PinFeedPost[]) : [],
            });
        } catch {
            setError("ピン新着の読み込みに失敗しました。");
        } finally {
            setLoading(false);
        }
    }, [session?.user]);

    useEffect(() => {
        if (session?.user) {
            void loadFeed();
        }
    }, [session?.user, loadFeed]);

    const unpinUser = async (targetUserId: string) => {
        if (!targetUserId || deletingPinId) return;
        if (!confirm("ピンを外しますか？")) return;

        setDeletingPinId(targetUserId);
        setError("");
        try {
            const res = await fetch(`/api/pins?userId=${encodeURIComponent(targetUserId)}`, {
                method: "DELETE",
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
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 400, marginBottom: 16 }}>
                    ピンしたユーザーの新着
                </h1>
                <p style={{ marginBottom: 16, color: "var(--text-soft)", fontSize: 13 }}>
                    ピン中の人数: {payload.pinnedCount}
                </p>

                {error && <div className="login-message login-error" style={{ marginBottom: 12 }}>{error}</div>}

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
                                    style={{
                                        border: "1px solid var(--border)",
                                        borderRadius: 12,
                                        background: "var(--card)",
                                        padding: 14,
                                    }}
                                >
                                    <h3 style={{ marginBottom: 6, fontSize: 18 }}>{post.title}</h3>
                                    <p style={{ marginBottom: 6, fontSize: 12, color: "var(--text-soft)" }}>
                                        by{" "}
                                        <Link href={authorHref(post.author)} style={{ textDecoration: "none", color: "var(--azuki)" }}>
                                            {authorLabel(post.author)}
                                        </Link>
                                        {" ・ "}
                                        {new Date(post.createdAt).toLocaleString("ja-JP")}
                                    </p>
                                    {post.excerpt ? (
                                        <p style={{ marginBottom: 8, whiteSpace: "pre-wrap", fontSize: 14 }}>{post.excerpt}</p>
                                    ) : null}
                                    <details>
                                        <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--azuki)" }}>
                                            本文を見る
                                        </summary>
                                        <div
                                            className="md-content"
                                            style={{ marginTop: 8 }}
                                            dangerouslySetInnerHTML={{ __html: post.content }}
                                        />
                                    </details>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </>
    );
}
