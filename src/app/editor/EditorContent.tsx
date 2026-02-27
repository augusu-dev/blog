// Editor content component - wrapped by page.tsx with Suspense
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import RichEditor from "@/components/RichEditor";
import TagInput from "@/components/TagInput";

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
    const [published, setPublished] = useState(false);
    const [saving, setSaving] = useState(false);
    const [myPosts, setMyPosts] = useState<Post[]>([]);
    const [message, setMessage] = useState("");
    const contentKeyRef = useRef(0);

    const [isLoaded, setIsLoaded] = useState(false);

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
        if (isLoaded || !session) return;

        if (editId) {
            fetch(`/api/posts/${editId}`)
                .then((res) => res.json())
                .then((post) => {
                    setTitle(post.title || "");
                    setContent(post.content || "");
                    setExcerpt(post.excerpt || "");
                    setTags(post.tags || []);
                    setPublished(post.published || false);
                    if (post.tags?.includes("product")) setPostType("product");
                    contentKeyRef.current += 1;
                    setIsLoaded(true);
                })
                .catch(console.error);
        } else if (!editId) {
            // Load autosave from local storage for new posts
            const saved = localStorage.getItem("draft-post");
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    if (data.title) setTitle(data.title);
                    if (data.content) { setContent(data.content); contentKeyRef.current += 1; }
                    if (data.excerpt) setExcerpt(data.excerpt);
                    if (data.tags) setTags(data.tags);
                    if (data.postType) setPostType(data.postType);
                } catch { }
            }
            setIsLoaded(true);
        }
    }, [editId, session, isLoaded]);

    // Auto-save to local storage on change
    useEffect(() => {
        if (!editId) {
            const timer = setTimeout(() => {
                if (title || content) {
                    localStorage.setItem("draft-post", JSON.stringify({ title, content, excerpt, tags, postType }));
                }
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [title, content, excerpt, tags, postType, editId]);

    // Strip HTML for excerpt
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

        // Add post type as a tag if product
        const finalTags = postType === "product" && !tags.includes("product")
            ? [...tags, "product"]
            : tags.filter(t => postType === "blog" ? t !== "product" : true);

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
        setPublished(false);
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
                    Next Blog
                </Link>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--text-soft)" }}>
                        {session.user?.name || session.user?.email}
                    </span>
                    <Link href="/settings" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                        ⚙
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
                        disabled={saving}
                    >
                        {saving ? "保存中..." : "公開する"}
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
