/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

type ShortPostAuthor = {
    id: string;
    userId?: string | null;
    name: string | null;
    email: string | null;
    image: string | null;
};

type ShortPostItem = {
    id: string;
    content: string;
    createdAt: string;
    author: ShortPostAuthor;
};

function getAuthorLabel(author: ShortPostAuthor): string {
    return author.name || author.email || "Anonymous";
}

function getAuthorHref(author: ShortPostAuthor): string {
    return `/user/${encodeURIComponent(author.userId || author.id)}`;
}

function formatShortPostTime(value: string): string {
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

function renderTextWithLinks(content: string) {
    const urlPattern = /(https?:\/\/[^\s<>"']+)/g;
    const parts: ReactNode[] = [];
    let lastIndex = 0;

    for (const match of content.matchAll(urlPattern)) {
        const matchedUrl = match[0];
        const start = match.index ?? 0;
        if (start > lastIndex) {
            parts.push(content.slice(lastIndex, start));
        }
        parts.push(
            <a
                key={`${matchedUrl}-${start}`}
                href={matchedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--azuki)", textDecoration: "underline" }}
            >
                {matchedUrl}
            </a>
        );
        lastIndex = start + matchedUrl.length;
    }

    if (lastIndex < content.length) {
        parts.push(content.slice(lastIndex));
    }

    return parts.length > 0 ? parts : content;
}

export default function ShortPostsPage() {
    const { data: session } = useSession();
    const currentUserId = useMemo(
        () => (session?.user as { id?: string } | undefined)?.id || "",
        [session?.user]
    );

    const [posts, setPosts] = useState<ShortPostItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState("");

    const loadPosts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/short-posts");
            const payload = await res.json().catch(() => []);
            if (!res.ok) {
                setError("投稿の読み込みに失敗しました。");
                return;
            }
            setPosts(Array.isArray(payload) ? payload.slice(0, 30) : []);
        } catch {
            setError("投稿の読み込みに失敗しました。");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadPosts();
    }, [loadPosts]);

    const deletePost = async (postId: string) => {
        if (!postId || deletingId) return;
        if (!confirm("この投稿を削除しますか？")) return;

        setDeletingId(postId);
        setError("");
        try {
            const res = await fetch(`/api/short-posts/${encodeURIComponent(postId)}`, {
                method: "DELETE",
            });
            const payload = await res.json().catch(() => ({} as { error?: string }));
            if (!res.ok) {
                setError(payload.error || "削除に失敗しました。");
                return;
            }
            setPosts((prev) => prev.filter((post) => post.id !== postId));
        } catch {
            setError("削除に失敗しました。");
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <>
            <nav className="navbar" style={{ justifyContent: "space-between" }}>
                <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>
                    <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                    Next Blog <span className="beta-badge">β</span>
                </Link>
                <div className="nav-auth">
                    <Link href="/" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                        ホームへ戻る
                    </Link>
                </div>
            </nav>

            <div className="editor-container" style={{ maxWidth: 860 }}>
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 400, marginBottom: 16 }}>
                    最近のポスト
                </h1>
                {error && <div className="login-message login-error" style={{ marginBottom: 12 }}>{error}</div>}

                <section
                    style={{
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        background: "var(--card)",
                        maxHeight: "70vh",
                        overflow: "auto",
                        padding: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                    }}
                >
                    {loading ? (
                        <p style={{ color: "var(--text-soft)", fontSize: 13 }}>読み込み中...</p>
                    ) : posts.length === 0 ? (
                        <p style={{ color: "var(--text-soft)", fontSize: 13 }}>まだ投稿はありません。</p>
                    ) : (
                        posts.map((post) => {
                            const mine = currentUserId && post.author.id === currentUserId;
                            return (
                                <article
                                    key={post.id}
                                    style={{
                                        border: "1px solid var(--border)",
                                        borderRadius: 12,
                                        background: mine ? "rgba(155,107,107,0.08)" : "var(--bg-card)",
                                        padding: 10,
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                            <Link href={getAuthorHref(post.author)} style={{ textDecoration: "none" }}>
                                                <div
                                                    title="プロフィールへ"
                                                    style={{
                                                        width: 28,
                                                        height: 28,
                                                        borderRadius: "50%",
                                                        border: "1px solid var(--border)",
                                                        background: "var(--bg-soft)",
                                                        overflow: "hidden",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        color: "var(--azuki)",
                                                        fontWeight: 600,
                                                        fontSize: 11,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {post.author.image ? (
                                                        <img
                                                            src={post.author.image}
                                                            alt={getAuthorLabel(post.author)}
                                                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                        />
                                                    ) : (
                                                        getAuthorLabel(post.author).charAt(0).toUpperCase()
                                                    )}
                                                </div>
                                            </Link>
                                            <p
                                                style={{
                                                    margin: 0,
                                                    fontSize: 12,
                                                    color: "var(--text-soft)",
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                }}
                                            >
                                                {getAuthorLabel(post.author)} ・ {formatShortPostTime(post.createdAt)}
                                            </p>
                                        </div>

                                        {mine ? (
                                            <button
                                                type="button"
                                                className="editor-btn editor-btn-secondary"
                                                onClick={() => void deletePost(post.id)}
                                                disabled={deletingId === post.id}
                                                style={{ fontSize: 11, padding: "2px 8px" }}
                                            >
                                                {deletingId === post.id ? "削除中..." : "削除"}
                                            </button>
                                        ) : null}
                                    </div>
                                    <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 14 }}>
                                        {renderTextWithLinks(post.content)}
                                    </p>
                                </article>
                            );
                        })
                    )}
                </section>
            </div>
        </>
    );
}
