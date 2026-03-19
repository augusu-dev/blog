// Editor content component - wrapped by page.tsx with Suspense
/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import RichEditor from "@/components/RichEditor";
import TagInput from "@/components/TagInput";
import UnreadDmButton from "@/components/UnreadDmButton";
import { canRequestPullRequestExtension } from "@/lib/pullRequestPublication";

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
    publicationGrants?: Array<{
        id: string;
        createdAt?: string | null;
        expiresAt?: string | null;
        sourcePullRequestId?: string | null;
        host: {
            id: string;
            userId?: string | null;
            name: string | null;
            email: string | null;
            image?: string | null;
        };
    }>;
}

type PostType = "blog" | "product";

type EditorSnapshot = {
    postType: PostType;
    title: string;
    content: string;
    excerpt: string;
    tags: string[];
    aiGenerated: boolean;
};

function createSnapshot(values: EditorSnapshot): EditorSnapshot {
    return {
        ...values,
        tags: [...values.tags],
    };
}

function snapshotsEqual(a: EditorSnapshot, b: EditorSnapshot): boolean {
    return (
        a.postType === b.postType &&
        a.title === b.title &&
        a.content === b.content &&
        a.excerpt === b.excerpt &&
        a.aiGenerated === b.aiGenerated &&
        a.tags.length === b.tags.length &&
        a.tags.every((tag, index) => tag === b.tags[index])
    );
}

export default function EditorPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get("id");
    const initialType = searchParams.get("type");

    // Post type: "blog" or "product"
    const [postType, setPostType] = useState<PostType>(
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
    const savedSnapshotRef = useRef<EditorSnapshot>(
        createSnapshot({
            postType: initialType === "product" ? "product" : "blog",
            title: "",
            content: "",
            excerpt: "",
            tags: [],
            aiGenerated: false,
        })
    );
    const hasUnsavedChangesRef = useRef(false);
    const bypassLeaveGuardRef = useRef(false);
    const pendingNavigationRef = useRef<(() => void) | null>(null);
    const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    const buildCurrentSnapshot = useCallback(
        (): EditorSnapshot =>
            createSnapshot({
                postType,
                title,
                content,
                excerpt,
                tags,
                aiGenerated,
            }),
        [aiGenerated, content, excerpt, postType, tags, title]
    );

    const markCurrentStateAsSaved = useCallback(() => {
        savedSnapshotRef.current = buildCurrentSnapshot();
        hasUnsavedChangesRef.current = false;
    }, [buildCurrentSnapshot]);

    const closeLeaveConfirmModal = useCallback(() => {
        pendingNavigationRef.current = null;
        setShowLeaveConfirmModal(false);
    }, []);

    const confirmLeaveAndNavigate = useCallback(() => {
        const action = pendingNavigationRef.current;
        pendingNavigationRef.current = null;
        setShowLeaveConfirmModal(false);

        if (!action) return;

        bypassLeaveGuardRef.current = true;
        action();
    }, []);

    const navigateWithGuard = useCallback(
        (action: () => void) => {
            if (bypassLeaveGuardRef.current || !hasUnsavedChangesRef.current) {
                bypassLeaveGuardRef.current = true;
                action();
                return;
            }

            pendingNavigationRef.current = action;
            setShowLeaveConfirmModal(true);
        },
        []
    );

    // Load my posts
    const loadMyPosts = useCallback(async () => {
        if (status !== "authenticated") return;

        const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const res = await fetch("/api/posts/my", { cache: "no-store" });
                const data = await res.json().catch(() => []);
                if (res.ok && Array.isArray(data)) {
                    setMyPosts(data);
                    return;
                }
                if (res.status >= 400 && res.status < 500) {
                    return;
                }
            } catch (e) {
                if (attempt === 2) {
                    console.warn("Failed to load posts:", e);
                }
            }

            if (attempt < 2) {
                await wait(300 * (attempt + 1));
            }
        }
    }, [status]);

    useEffect(() => {
        if (status === "authenticated") {
            void loadMyPosts();
        }
    }, [loadMyPosts, status]);

    useEffect(() => {
        hasUnsavedChangesRef.current = !snapshotsEqual(savedSnapshotRef.current, buildCurrentSnapshot());
    }, [buildCurrentSnapshot]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (bypassLeaveGuardRef.current || !hasUnsavedChangesRef.current) return;
            event.preventDefault();
            event.returnValue = "";
        };

        const handleDocumentClick = (event: MouseEvent) => {
            if (bypassLeaveGuardRef.current || !hasUnsavedChangesRef.current) return;
            if (event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const target = event.target as HTMLElement | null;
            const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
            if (!anchor) return;
            if (anchor.target === "_blank") return;

            const href = anchor.getAttribute("href");
            if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

            const currentUrl = new URL(window.location.href);
            const nextUrl = new URL(anchor.href, window.location.href);
            if (currentUrl.href === nextUrl.href) return;

            event.preventDefault();
            event.stopPropagation();
            pendingNavigationRef.current = () => {
                window.location.assign(anchor.href);
            };
            setShowLeaveConfirmModal(true);
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        document.addEventListener("click", handleDocumentClick, true);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            document.removeEventListener("click", handleDocumentClick, true);
        };
    }, []);

    // Load post for editing
    useEffect(() => {
        if (!session) return;

        if (editId && editId !== lastFetchedId) {
            fetch(`/api/posts/${editId}`)
                .then((res) => res.json())
                .then((post) => {
                    const loadedTags = Array.isArray(post.tags) ? post.tags : [];
                    const nextPostType = loadedTags.includes("product") ? "product" : "blog";
                    setTitle(post.title || "");
                    setContent(post.content || "");
                    setExcerpt(post.excerpt || "");
                    setTags(loadedTags.filter((tag: string) => tag !== AI_TAG));
                    setAiGenerated(loadedTags.includes(AI_TAG));
                    setPostType(nextPostType);
                    savedSnapshotRef.current = createSnapshot({
                        postType: nextPostType,
                        title: post.title || "",
                        content: post.content || "",
                        excerpt: post.excerpt || "",
                        tags: loadedTags.filter((tag: string) => tag !== AI_TAG),
                        aiGenerated: loadedTags.includes(AI_TAG),
                    });
                    hasUnsavedChangesRef.current = false;
                    contentKeyRef.current += 1;
                    bypassLeaveGuardRef.current = false;
                    setLastFetchedId(editId);
                    setIsLoaded(true);
                })
                .catch(console.error);
        } else if (!editId && !isLoaded) {
            savedSnapshotRef.current = createSnapshot({
                postType,
                title: "",
                content: "",
                excerpt: "",
                tags: [],
                aiGenerated: false,
            });
            hasUnsavedChangesRef.current = false;
            bypassLeaveGuardRef.current = false;
            setIsLoaded(true);
        }
    }, [editId, isLoaded, lastFetchedId, postType, session]);

    const buildFinalTags = () => {
        const baseTags = postType === "product" && !tags.includes("product")
            ? [...tags, "product"]
            : tags.filter((t) => (postType === "blog" ? t !== "product" : true));
        const withoutAiTag = baseTags.filter((tag) => tag !== AI_TAG);
        return aiGenerated ? [...withoutAiTag, AI_TAG] : withoutAiTag;
    };

    const handleBack = () => {
        navigateWithGuard(() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
                router.back();
            } else {
                router.push("/");
            }
        });
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
                markCurrentStateAsSaved();
                loadMyPosts();
                if (!editId) {
                    const post = await res.json();
                    bypassLeaveGuardRef.current = true;
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

            markCurrentStateAsSaved();
            setMessage("✅ 依頼を送信しました。");
        } catch {
            setMessage("❌ 依頼の送信に失敗しました。");
        } finally {
            setRequesting(false);
        }
    };

    void requestArticle;

    const sendPullRequestRequest = async () => {
        if (!title.trim() || !content.trim()) {
            setMessage("Title and content are required.");
            return;
        }

        const recipientQuery = prompt("Enter the recipient user ID or name.");
        if (!recipientQuery || !recipientQuery.trim()) return;

        setRequesting(true);
        setMessage("");

        try {
            let dmMessage = "";

            try {
                const recipientRes = await fetch(`/api/user/${encodeURIComponent(recipientQuery.trim())}`, {
                    cache: "no-store",
                    credentials: "same-origin",
                });
                const recipientPayload = await recipientRes.json().catch(() => ({}));
                const dmSetting =
                    recipientPayload &&
                    typeof recipientPayload === "object" &&
                    (recipientPayload.dmSetting === "OPEN" ||
                        recipientPayload.dmSetting === "PR_ONLY" ||
                        recipientPayload.dmSetting === "CLOSED")
                        ? recipientPayload.dmSetting
                        : null;

                if (dmSetting !== "PR_ONLY") {
                    dmMessage = prompt("Optional DM message")?.trim() || "";
                }
            } catch {
                dmMessage = prompt("Optional DM message")?.trim() || "";
            }

            if (dmMessage.length > 10000) {
                setMessage("DM message must be 10000 characters or fewer.");
                return;
            }

            const res = await fetch("/api/pull-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    kind: "SUBMISSION",
                    postId: editId || undefined,
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
                setMessage(`Error: ${payload.error || "Failed to send pull request."}`);
                return;
            }

            markCurrentStateAsSaved();
            if (!editId && typeof payload.postId === "string") {
                bypassLeaveGuardRef.current = true;
                router.push(`/editor?id=${payload.postId}`);
            }
            await loadMyPosts();
            setMessage("Pull request sent.");
        } catch {
            setMessage("Error: Failed to send pull request.");
        } finally {
            setRequesting(false);
        }
    };

    const requestExtension = async (post: Post) => {
        const eligibleGrants = (post.publicationGrants || []).filter((grant) =>
            canRequestPullRequestExtension(grant.expiresAt || null)
        );

        if (eligibleGrants.length === 0) {
            setMessage("延長申請は掲載期限の7日前から可能です。");
            return;
        }

        let selectedGrant = eligibleGrants[0];
        if (eligibleGrants.length > 1) {
            const selectionText = eligibleGrants
                .map((grant, index) => {
                    const hostLabel = grant.host.name || grant.host.email || grant.host.userId || grant.host.id;
                    const expiresAt = grant.expiresAt ? new Date(grant.expiresAt).toLocaleDateString("ja-JP") : "";
                    return `${index + 1}: ${hostLabel} (${expiresAt})`;
                })
                .join("\n");
            const selectedInput = prompt(`延長申請を送る相手を選んでください。\n${selectionText}`);
            const selectedIndex = Number(selectedInput || "0") - 1;
            if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= eligibleGrants.length) {
                return;
            }
            selectedGrant = eligibleGrants[selectedIndex];
        }

        setRequesting(true);
        setMessage("");

        try {
            const res = await fetch("/api/pull-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    kind: "EXTENSION",
                    postId: post.id,
                    recipientId: selectedGrant.host.id,
                }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMessage(`Error: ${payload.error || "Failed to send the extension request."}`);
                return;
            }

            await loadMyPosts();
            setMessage("掲載延長の申請を送りました。");
        } catch {
            setMessage("Error: Failed to send the extension request.");
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
                    bypassLeaveGuardRef.current = true;
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

    const orderedMyPosts = [...myPosts].sort((a, b) => {
        if (a.published !== b.published) {
            return Number(a.published) - Number(b.published);
        }

        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const getEligiblePublicationGrants = (post: Post) =>
        (post.publicationGrants || []).filter((grant) => canRequestPullRequestExtension(grant.expiresAt || null));

    return (
        <>
            <nav className="navbar" style={{ justifyContent: "space-between" }}>
                <Link href="/" className="nav-logo">
                    <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                    Next Blog <span className="beta-badge">β</span>
                </Link>
                <div className="nav-auth" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Link href="/settings" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                        ⚙
                    </Link>
                    <UnreadDmButton className="nav-auth-btn nav-user-btn" />
                </div>
            </nav>

            <div className="editor-container">
                <div className="settings-page-title-row">
                    <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, fontWeight: 400, marginBottom: 0 }}>
                        記事を書く
                    </h1>
                    <button
                        type="button"
                        className="settings-back-btn"
                        onClick={handleBack}
                        aria-label="戻る"
                        title="戻る"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </button>
                </div>
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
                        onClick={sendPullRequestRequest}
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

                {postType === "product" ? (
                    <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-soft)" }}>
                        更新を追記するときは「更新線」を入れると、公開側で日付ごとの更新ログとして表示されます。
                    </p>
                ) : null}

                <RichEditor
                    key={contentKeyRef.current}
                    value={content}
                    onChange={setContent}
                    aiGenerated={aiGenerated}
                    onAiGeneratedChange={setAiGenerated}
                    showProductUpdateMarkerButton={postType === "product"}
                    placeholder={postType === "blog"
                        ? "ここに記事を書きましょう..."
                        : "プロダクトの詳細を書きましょう..."
                    }
                />

                {/* My posts list */}
                {orderedMyPosts.length > 0 && (
                    <div style={{ marginTop: 48 }}>
                        <h3 className="my-posts-title">自分の投稿</h3>
                        <div className="my-posts-list">
                            {orderedMyPosts.map((post) => (
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
                                        {(post.publicationGrants || []).length > 0 ? (
                                            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                                                {(post.publicationGrants || []).map((grant) => {
                                                    const hostLabel =
                                                        grant.host.name || grant.host.email || grant.host.userId || grant.host.id;
                                                    const expiresLabel = grant.expiresAt
                                                        ? new Date(grant.expiresAt).toLocaleDateString("ja-JP")
                                                        : "";
                                                    return (
                                                        <span key={grant.id} style={{ fontSize: 11, color: "var(--text-soft)" }}>
                                                            {`掲載先: ${hostLabel}${expiresLabel ? ` / 期限: ${expiresLabel}` : ""}`}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        {getEligiblePublicationGrants(post).length > 0 ? (
                                            <button
                                                className="editor-btn editor-btn-secondary"
                                                style={{ padding: "6px 12px", fontSize: 12 }}
                                                onClick={() => requestExtension(post)}
                                                disabled={requesting}
                                            >
                                                延長申請
                                            </button>
                                        ) : null}
                                        <button
                                            className="editor-btn editor-btn-secondary"
                                            style={{ padding: "6px 12px", fontSize: 12 }}
                                            onClick={() => navigateWithGuard(() => router.push(`/editor?id=${post.id}`))}
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
            {showLeaveConfirmModal ? (
                <div className="restore-modal-backdrop" onClick={closeLeaveConfirmModal}>
                    <div className="restore-modal-card" onClick={(event) => event.stopPropagation()}>
                        <h3 className="restore-modal-title">下書きを保存していません</h3>
                        <p className="restore-modal-copy">
                            下書きを保存しないままページを移動すると、いま書いている内容は保存されません。
                            そのまま移動してよろしいですか？
                        </p>
                        <div className="restore-modal-actions">
                            <button
                                type="button"
                                className="editor-btn editor-btn-secondary"
                                onClick={closeLeaveConfirmModal}
                            >
                                いいえ
                            </button>
                            <button
                                type="button"
                                className="editor-btn editor-btn-primary"
                                onClick={confirmLeaveAndNavigate}
                            >
                                はい
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
