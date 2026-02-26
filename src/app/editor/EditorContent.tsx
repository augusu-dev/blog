// Editor content component - wrapped by page.tsx with Suspense
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import RichEditor from "@/components/RichEditor";

interface Post {
    id: string;
    title: string;
    content: string;
    excerpt: string;
    tags: string[];
    published: boolean;
    createdAt: string;
    updatedAt: string;
}

export default function EditorPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get("id");

    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [tagsInput, setTagsInput] = useState("");
    const [published, setPublished] = useState(false);
    const [saving, setSaving] = useState(false);
    const [myPosts, setMyPosts] = useState<Post[]>([]);
    const [message, setMessage] = useState("");

    // Redirect to login if not authenticated
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    // Load my posts
    const loadMyPosts = useCallback(async () => {
        try {
            const res = await fetch("/api/posts/my");
            if (res.ok) {
                const data = await res.json();
                setMyPosts(data);
            }
        } catch (e) {
            console.warn("Failed to load posts:", e);
        }
    }, []);

    useEffect(() => {
        if (session) loadMyPosts();
    }, [session, loadMyPosts]);

    // Load post for editing
    useEffect(() => {
        if (editId && session) {
            fetch(`/api/posts/${editId}`)
                .then((res) => res.json())
                .then((post) => {
                    setTitle(post.title || "");
                    setContent(post.content || "");
                    setExcerpt(post.excerpt || "");
                    setTagsInput((post.tags || []).join(", "));
                    setPublished(post.published || false);
                })
                .catch(console.error);
        }
    }, [editId, session]);

    // Strip HTML for excerpt generation
    const stripHtml = (html: string) => {
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    };

    // Save post
    const savePost = async (pub: boolean) => {
        if (!title.trim() || !content.trim()) {
            setMessage("タイトルと本文を入力してください。");
            return;
        }

        setSaving(true);
        setMessage("");
        const tags = tagsInput
            .split(/[,、]/)
            .map((t) => t.trim())
            .filter(Boolean);

        try {
            const url = editId ? `/api/posts/${editId}` : "/api/posts";
            const method = editId ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    content,
                    excerpt: excerpt.trim() || stripHtml(content).substring(0, 100) + "...",
                    tags,
                    published: pub,
                }),
            });

            if (res.ok) {
                setMessage(pub ? "✅ 記事を公開しました！" : "✅ 下書きを保存しました。");
                loadMyPosts();
                if (!editId) {
                    const post = await res.json();
                    router.push(`/editor?id=${post.id}`);
                }
            } else {
                const err = await res.json();
                setMessage("❌ エラー: " + (err.error || "保存に失敗しました"));
            }
        } catch {
            setMessage("❌ 保存中にエラーが発生しました。");
        } finally {
            setSaving(false);
        }
    };

    // Delete post
    const deletePost = async (id: string) => {
        if (!confirm("この記事を削除しますか？")) return;

        try {
            const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
            if (res.ok) {
                setMessage("記事を削除しました。");
                loadMyPosts();
                if (editId === id) {
                    router.push("/editor");
                    setTitle("");
                    setContent("");
                    setExcerpt("");
                    setTagsInput("");
                    setPublished(false);
                }
            }
        } catch {
            setMessage("❌ 削除に失敗しました。");
        }
    };

    // New post
    const newPost = () => {
        router.push("/editor");
        setTitle("");
        setContent("");
        setExcerpt("");
        setTagsInput("");
        setPublished(false);
        setMessage("");
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

    if (!session) return null;

    return (
        <>
            {/* Simple navbar for editor */}
            <nav className="navbar" style={{ justifyContent: "space-between" }}>
                <Link href="/" className="nav-logo">
                    <img src="/images/a.png" alt="Augusu" className="nav-logo-img" />
                    Augusu
                </Link>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-soft)" }}>
                        {session.user?.name || session.user?.email}
                    </span>
                    <button className="nav-auth-btn nav-user-btn" onClick={newPost}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        新規作成
                    </button>
                </div>
            </nav>

            <div className="editor-container">
                {/* Message */}
                {message && (
                    <div
                        className={`login-message ${message.startsWith("❌") ? "login-error" : ""}`}
                        style={{ marginBottom: 20 }}
                    >
                        {message}
                    </div>
                )}

                {/* Editor form */}
                <input
                    type="text"
                    className="editor-title-input"
                    placeholder="記事のタイトル"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />

                <div className="editor-meta">
                    <input
                        type="text"
                        className="editor-tags-input"
                        placeholder="タグ（カンマ区切り: AI, 思考, コード）"
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                    />
                    <div className="editor-actions">
                        <button
                            className="editor-btn editor-btn-secondary"
                            onClick={() => savePost(false)}
                            disabled={saving}
                        >
                            {saving ? "保存中..." : "下書き保存"}
                        </button>
                        <button
                            className="editor-btn editor-btn-primary"
                            onClick={() => savePost(true)}
                            disabled={saving}
                        >
                            {saving ? "保存中..." : "公開する"}
                        </button>
                    </div>
                </div>

                <input
                    type="text"
                    className="editor-excerpt-input"
                    placeholder="記事の概要（省略可）"
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                />

                {/* Rich text editor */}
                <RichEditor
                    value={content}
                    onChange={setContent}
                    placeholder="ここに記事を書きましょう..."
                />

                {/* My posts list */}
                {myPosts.length > 0 && (
                    <div style={{ marginTop: 48 }}>
                        <h3 className="my-posts-title">自分の記事</h3>
                        <div className="my-posts-list">
                            {myPosts.map((post) => (
                                <div key={post.id} className="my-post-item">
                                    <div style={{ flex: 1 }}>
                                        <h4>
                                            {post.title}
                                            <span className={`post-status ${post.published ? "published" : "draft"}`} style={{ marginLeft: 8 }}>
                                                {post.published ? "公開中" : "下書き"}
                                            </span>
                                        </h4>
                                        <p style={{ fontSize: 12, color: "var(--text-soft)" }}>
                                            {new Date(post.updatedAt).toLocaleDateString("ja-JP")}
                                        </p>
                                    </div>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <button
                                            className="editor-btn editor-btn-secondary"
                                            style={{ padding: "6px 12px", fontSize: 12 }}
                                            onClick={() => router.push(`/editor?id=${post.id}`)}
                                        >
                                            編集
                                        </button>
                                        <button
                                            className="editor-btn editor-btn-danger"
                                            style={{ padding: "6px 12px", fontSize: 12 }}
                                            onClick={() => deletePost(post.id)}
                                        >
                                            削除
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
