/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { readSessionCache, writeSessionCache } from "@/lib/clientSessionCache";

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

const SHORT_POST_LIMIT = 300;
const LOAD_ERROR_MESSAGE = "短文ポストの読み込みに失敗しました。";
const SUBMIT_ERROR_MESSAGE = "短文ポストの投稿に失敗しました。";

const SHORT_POSTS_CACHE_KEY = "home-short-posts-cache:v1";
const SHORT_POSTS_CACHE_TTL_MS = 60 * 1000;

function formatDate(value: string): string {
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

function getAuthorLabel(author: ShortPostAuthor): string {
    return author.name || author.email || "Anonymous";
}

function getAuthorHref(author: ShortPostAuthor): string {
    return author.userId ? `/user/${encodeURIComponent(author.userId)}` : "#";
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

export default function HomeShortPosts() {
    const { data: session } = useSession();
    const router = useRouter();

    const [posts, setPosts] = useState<ShortPostItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [openComposer, setOpenComposer] = useState(false);
    const [content, setContent] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const remaining = useMemo(() => SHORT_POST_LIMIT - content.length, [content.length]);

    const loadPosts = useCallback(async (attempt = 0): Promise<void> => {
        const cachedPosts = readSessionCache<ShortPostItem[]>(SHORT_POSTS_CACHE_KEY, SHORT_POSTS_CACHE_TTL_MS);
        if (attempt === 0 && cachedPosts && cachedPosts.length > 0) {
            setPosts(cachedPosts);
            setLoading(false);
            setError("");
        } else {
            setLoading(true);
        }
        try {
            const res = await fetch("/api/short-posts");
            const payload = await res.json().catch(() => []);
            if (!res.ok) {
                if (res.status >= 400 && res.status < 500) {
                    setError(LOAD_ERROR_MESSAGE);
                    return;
                }
                if (attempt < 2) {
                    await new Promise((resolve) => setTimeout(resolve, 350));
                    await loadPosts(attempt + 1);
                    return;
                }
                setError(LOAD_ERROR_MESSAGE);
                return;
            }
            const nextPosts = Array.isArray(payload) ? payload.slice(0, 30) : [];
            setPosts(nextPosts);
            writeSessionCache(SHORT_POSTS_CACHE_KEY, nextPosts);
            setError("");
        } catch {
            if (attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 350));
                await loadPosts(attempt + 1);
                return;
            }
            if (!cachedPosts || cachedPosts.length === 0) {
                setError(LOAD_ERROR_MESSAGE);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadPosts();
    }, [loadPosts]);

    const openComposerModal = () => {
        if (!session?.user) {
            router.push("/login");
            return;
        }
        setError("");
        setOpenComposer(true);
    };

    const submitPost = async () => {
        const normalized = content.trim();
        if (!normalized || normalized.length > SHORT_POST_LIMIT || submitting) return;

        setSubmitting(true);
        setError("");
        try {
            const res = await fetch("/api/short-posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: normalized }),
            });
            const payload = await res.json().catch(() => ({} as { error?: string }));
            if (!res.ok) {
                setError(payload.error || SUBMIT_ERROR_MESSAGE);
                return;
            }

            setContent("");
            setOpenComposer(false);
            setPosts((prev) => {
                const nextPosts = [payload as ShortPostItem, ...prev].slice(0, 30);
                writeSessionCache(SHORT_POSTS_CACHE_KEY, nextPosts);
                return nextPosts;
            });
        } catch {
            setError(SUBMIT_ERROR_MESSAGE);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <section className="section" style={{ paddingTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <h2 className="section-title" style={{ marginBottom: 10 }}>
                        最近のポスト
                    </h2>
                    <Link
                        href="/posts/shorts"
                        className="editor-btn editor-btn-secondary"
                        style={{ textDecoration: "none", padding: "6px 12px", fontSize: 12 }}
                    >
                        もっと見る
                    </Link>
                </div>

                {error ? (
                    <div className="login-message login-error" style={{ marginBottom: 12 }}>
                        {error}
                    </div>
                ) : null}

                <div
                    style={{
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        background: "var(--card)",
                        maxHeight: 500,
                        overflow: "auto",
                    }}
                >
                    {loading ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)", padding: 12 }}>読み込み中...</p>
                    ) : posts.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)", padding: 12 }}>まだ投稿はありません。</p>
                    ) : (
                        posts.map((post) => (
                            <article
                                key={post.id}
                                style={{
                                    padding: "10px 12px",
                                    borderBottom: "1px solid var(--border)",
                                    display: "flex",
                                    gap: 10,
                                    alignItems: "flex-start",
                                }}
                            >
                                <Link href={getAuthorHref(post.author)} style={{ textDecoration: "none" }}>
                                    <div
                                        title="プロフィールへ"
                                        style={{
                                            width: 30,
                                            height: 30,
                                            borderRadius: "50%",
                                            border: "1px solid var(--border)",
                                            background: "var(--bg-soft)",
                                            color: "var(--azuki)",
                                            overflow: "hidden",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 12,
                                            fontWeight: 600,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {post.author?.image ? (
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
                                <div style={{ minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: 12, color: "var(--text-soft)" }}>
                                        {getAuthorLabel(post.author)} ・ {formatDate(post.createdAt)}
                                    </p>
                                    <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14 }}>
                                        {renderTextWithLinks(post.content)}
                                    </p>
                                </div>
                            </article>
                        ))
                    )}
                </div>
            </section>

            <button
                type="button"
                className="short-post-fab"
                title="短文ポストを投稿"
                onClick={openComposerModal}
            >
                ✍️
            </button>

            {openComposer ? (
                <div className="short-post-modal-backdrop" onClick={() => setOpenComposer(false)}>
                    <div className="short-post-modal" onClick={(event) => event.stopPropagation()}>
                        <h3 style={{ marginBottom: 8, fontFamily: "var(--serif)", fontWeight: 400 }}>短文ポスト</h3>
                        <textarea
                            className="login-input"
                            rows={5}
                            maxLength={SHORT_POST_LIMIT}
                            value={content}
                            onChange={(event) => setContent(event.target.value)}
                            placeholder="300文字以内で投稿"
                            style={{ resize: "vertical", fontFamily: "var(--sans)", marginBottom: 8 }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, color: remaining < 0 ? "#c44" : "var(--text-soft)" }}>
                                {content.length}/{SHORT_POST_LIMIT}
                            </span>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button
                                    type="button"
                                    className="editor-btn editor-btn-secondary"
                                    onClick={() => setOpenComposer(false)}
                                >
                                    閉じる
                                </button>
                                <button
                                    type="button"
                                    className="editor-btn editor-btn-primary"
                                    onClick={submitPost}
                                    disabled={submitting || !content.trim() || content.trim().length > SHORT_POST_LIMIT}
                                >
                                    {submitting ? "投稿中..." : "投稿"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
