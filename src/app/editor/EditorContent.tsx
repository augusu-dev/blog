// Editor content component - wrapped by page.tsx with Suspense
/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import RichEditor from "@/components/RichEditor";
import TagInput from "@/components/TagInput";

const AI_TAG = "ai-generated";

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
    const initialType = searchParams.get("type");

    // Post type: "blog" or "product"
    const [postType, setPostType] = useState<"blog" | "product">(
        initialType === "product" ? "product" : "blog"
    );
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [aiGenerated, setAiGenerated] = useState(false);
    const [saving, setSaving] = useState(false);
    const [requesting, setRequesting] = useState(false);
    const [myPosts, setMyPosts] = useState<Post[]>([]);
    const [message, setMessage] = useState("");
    const contentKeyRef = useRef(0);
    const [isLoaded, setIsLoaded] = useState(false);
    const [lastFetchedId, setLastFetchedId] = useState<string | null>(null);

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
        if (!session) return;

        if (editId && editId !== lastFetchedId) {
            fetch(`/api/posts/${editId}`)
                .then((res) => res.json())
                .then((post) => {
                    setTitle(post.title || "");
                    setContent(post.content || "");
                    setExcerpt(post.excerpt || "");
                    setTags(post.tags || []);
                    setAiGenerated((post.tags || []).includes(AI_TAG));
                    if (post.tags?.includes("product")) setPostType("product");
                    contentKeyRef.current += 1;
                    setLastFetchedId(editId);
                    setIsLoaded(true);
                })
                .catch(console.error);
        } else if (!editId && !isLoaded) {
            // Load autosave from local storage for new posts
            const saved = localStorage.getItem("draft-post");
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    if (data.title) setTitle(data.title);
                    if (data.content) { setContent(data.content); contentKeyRef.current += 1; }
                    if (data.excerpt) setExcerpt(data.excerpt);
                    if (data.tags) setTags(data.tags);
                    if (typeof data.aiGenerated === "boolean") setAiGenerated(data.aiGenerated);
                    if (data.postType) setPostType(data.postType);
                } catch { }
            }
            setIsLoaded(true);
        }
    }, [editId, session, isLoaded, lastFetchedId]);

    // Auto-save to local storage on change
    useEffect(() => {
        if (!editId) {
            const timer = setTimeout(() => {
                if (title || content) {
                    localStorage.setItem("draft-post", JSON.stringify({ title, content, excerpt, tags, postType, aiGenerated }));
                }
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [title, content, excerpt, tags, postType, aiGenerated, editId]);

    const buildFinalTags = () => {
        const baseTags = postType === "product" && !tags.includes("product")
            ? [...tags, "product"]
            : tags.filter((t) => (postType === "blog" ? t !== "product" : true));
        const withoutAiTag = baseTags.filter((tag) => tag !== AI_TAG);
        return aiGenerated ? [...withoutAiTag, AI_TAG] : withoutAiTag;
    };

    // Save post
    const savePost = async (pub: boolean) => {
        if (!title.trim() || !content.trim()) {
            setMessage("タイトルと本文を入力してください。");
            return;
        }

        setSaving(true);
        setMessage("");

        const finalTags = buildFinalTags();

        try {
            const url = editId ? `/api/posts/${editId}` : "/api/posts";
            const method = editId ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    content,
                    excerpt: excerpt.trim(), // DO NOT auto-generate from body
                    tags: finalTags,
                    published: pub,
                }),
            });

            if (res.ok) {
                setMessage(pub ? "✅ 記事を公開しました！" : "✅ 下書きを保存しました。");
                if (!editId) localStorage.removeItem("draft-post");
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

    const requestArticle = async () => {
        if (!title.trim() || !content.trim()) {
            setMessage("タイトルと本文を入力してください。");
            return;
        }

        const recipientQuery = prompt("依頼先のユーザーIDまたは名前を入力してください");
        if (!recipientQuery || !recipientQuery.trim()) return;

        const dmMessage = prompt("DMメッセージ（任意）")?.trim() || "";
        if (dmMessage.length > 10000) {
            setMessage("❌ DMメッセージは10000文字以内で入力してください。");
            return;
        }

        setRequesting(true);
        setMessage("");
        try {
            const res = await fetch("/api/pull-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recipientQuery: recipientQuery.trim(),
                    title: title.trim(),
                    excerpt: excerpt.trim(),
                    content,
                    tags: buildFinalTags(),
                    dmMessage,
                }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMessage(`❌ ${payload.error || "依頼の送信に失敗しました。"}`);
                return;
            }

            setMessage("✅ 依頼を送信しました。");
        } catch {
            setMessage("❌ 依頼の送信に失敗しました。");
        } finally {
            setRequesting(false);
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
                    resetForm();
                }
            }
        } catch {
            setMessage("❌ 削除に失敗しました。");
        }
    };

    const resetForm = () => {
        setTitle("");
        setContent("");
        setExcerpt("");
        setTags([]);
        setAiGenerated(false);
        setMessage("");
        contentKeyRef.current += 1;
    };

    // New post
    const newPost = (type?: "blog" | "product") => {
        router.push("/editor");
        if (type) setPostType(type);
        resetForm();
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
            <nav className="navbar" style={{ justifyContent: "space-between" }}>
                <Link href="/" className="nav-logo">
                    <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                    Next Blog <span className="beta-badge">β</span>
                </Link>
                <div className="nav-auth" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-soft)" }}>
                        {session.user?.name || session.user?.email}
                    </span>
                    <Link href="/settings" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                        ⚙
                    </Link>
                    <Link
                        href="/messages"
                        className="nav-auth-btn nav-user-btn"
                        style={{ textDecoration: "none" }}
                        title="DM"
                    >
                        ✉
                    </Link>
                    <button className="nav-auth-btn nav-user-btn" onClick={() => newPost()}>
                        ＋ 新規
                    </button>
                </div>
            </nav>

            <div className="editor-container">
                {message && (
                    <div
                        className={`login-message ${message.startsWith("❌") ? "login-error" : ""}`}
                        style={{ marginBottom: 20 }}
                    >
                        {message}
                    </div>
                )}

                {/* Post type toggle */}
                <div className="type-toggle" style={{ display: "flex", gap: 0, marginBottom: 20, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
                    <button
                        type="button"
                        className={`type-toggle-btn ${postType === "blog" ? "active" : ""}`}
                        onClick={() => setPostType("blog")}
                        style={{
                            flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
                            background: postType === "blog" ? "var(--azuki)" : "var(--card)",
                            color: postType === "blog" ? "var(--white)" : "var(--text-soft)",
                            fontFamily: "var(--sans)", fontSize: 13, fontWeight: 500, transition: "all 0.2s",
                        }}
                    >
                        📝 ブログ
                    </button>
                    <button
                        type="button"
                        className={`type-toggle-btn ${postType === "product" ? "active" : ""}`}
                        onClick={() => setPostType("product")}
                        style={{
                            flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
                            background: postType === "product" ? "var(--azuki)" : "var(--card)",
                            color: postType === "product" ? "var(--white)" : "var(--text-soft)",
                            fontFamily: "var(--sans)", fontSize: 13, fontWeight: 500, transition: "all 0.2s",
                        }}
                    >
                        🛠 プロダクト
                    </button>
                </div>

                <input
                    type="text"
                    className="editor-title-input"
                    placeholder={postType === "blog" ? "記事のタイトル" : "プロダクト名"}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />

                <div style={{ marginBottom: 16 }}>
                    <TagInput tags={tags} onChange={setTags} placeholder="タグを入力 (Enterで追加)" />
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 16, justifyContent: "flex-end" }}>
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
                        disabled={saving || requesting}
                    >
                        {saving ? "保存中..." : "公開する"}
                    </button>
                    <button
                        className="editor-btn editor-btn-secondary"
                        onClick={requestArticle}
                        disabled={saving || requesting}
                    >
                        {requesting ? "送信中..." : "依頼する"}
                    </button>
                </div>


                <input
                    type="text"
                    className="editor-excerpt-input"
                    placeholder={postType === "blog" ? "記事の概要（省略可）" : "プロダクトの説明（省略可）"}
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                />

                <RichEditor
                    key={contentKeyRef.current}
                    value={content}
                    onChange={setContent}
                    aiGenerated={aiGenerated}
                    onAiGeneratedChange={setAiGenerated}
                    placeholder={postType === "blog"
                        ? "ここに記事を書きましょう..."
                        : "プロダクトの詳細を書きましょう..."
                    }
                />

                {/* My posts list */}
                {myPosts.length > 0 && (
                    <div style={{ marginTop: 48 }}>
                        <h3 className="my-posts-title">自分の投稿</h3>
                        <div className="my-posts-list">
                            {myPosts.map((post) => (
                                <div key={post.id} className="my-post-item">
                                    <div style={{ flex: 1 }}>
                                        <h4>
                                            <span style={{ marginRight: 6, fontSize: 13 }}>
                                                {post.tags?.includes("product") ? "🛠" : "📝"}
                                            </span>
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
