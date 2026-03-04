/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface PostComment {
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    author: {
        id: string;
        name: string | null;
        email: string | null;
        image: string | null;
    };
}

interface PostCommentsProps {
    postId: string | null;
    isSignedIn: boolean;
    currentUserId?: string | null;
}

const COMMENT_LIMIT = 1000;

type LocaleText = {
    title: string;
    placeholder: string;
    post: string;
    posting: string;
    loginRequired: string;
    loading: string;
    empty: string;
    fetchFailed: string;
    submitFailed: string;
    updateFailed: string;
    deleteFailed: string;
    invalidLength: string;
    edit: string;
    save: string;
    saving: string;
    cancel: string;
    delete: string;
    deleteConfirm: string;
};

const TEXT: Record<"ja" | "en" | "zh", LocaleText> = {
    ja: {
        title: "Comments",
        placeholder: "コメントを書いてください",
        post: "コメントを投稿",
        posting: "投稿中...",
        loginRequired: "コメント投稿はログイン後に利用できます。",
        loading: "読み込み中...",
        empty: "まだコメントはありません。",
        fetchFailed: "コメントの取得に失敗しました。",
        submitFailed: "コメントの投稿に失敗しました。",
        updateFailed: "コメントの更新に失敗しました。",
        deleteFailed: "コメントの削除に失敗しました。",
        invalidLength: "コメントは1〜1000文字で入力してください。",
        edit: "編集",
        save: "保存",
        saving: "保存中...",
        cancel: "キャンセル",
        delete: "削除",
        deleteConfirm: "このコメントを削除しますか？",
    },
    en: {
        title: "Comments",
        placeholder: "Write a comment",
        post: "Post",
        posting: "Posting...",
        loginRequired: "Please log in to post comments.",
        loading: "Loading...",
        empty: "No comments yet.",
        fetchFailed: "Failed to load comments.",
        submitFailed: "Failed to post comment.",
        updateFailed: "Failed to update comment.",
        deleteFailed: "Failed to delete comment.",
        invalidLength: "Comment must be between 1 and 1000 characters.",
        edit: "Edit",
        save: "Save",
        saving: "Saving...",
        cancel: "Cancel",
        delete: "Delete",
        deleteConfirm: "Delete this comment?",
    },
    zh: {
        title: "Comments",
        placeholder: "请输入评论",
        post: "发布评论",
        posting: "发布中...",
        loginRequired: "登录后可发布评论。",
        loading: "加载中...",
        empty: "还没有评论。",
        fetchFailed: "获取评论失败。",
        submitFailed: "发布评论失败。",
        updateFailed: "更新评论失败。",
        deleteFailed: "删除评论失败。",
        invalidLength: "评论长度需为1到1000个字符。",
        edit: "编辑",
        save: "保存",
        saving: "保存中...",
        cancel: "取消",
        delete: "删除",
        deleteConfirm: "要删除这条评论吗？",
    },
};

export default function PostComments({ postId, isSignedIn, currentUserId = null }: PostCommentsProps) {
    const { language } = useLanguage();
    const locale = useMemo(() => TEXT[language], [language]);

    const [comments, setComments] = useState<PostComment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState("");
    const [savingEditId, setSavingEditId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        if (!postId) {
            setComments([]);
            setNewComment("");
            setError("");
            setEditingId(null);
            setEditingContent("");
            return;
        }

        let active = true;
        setLoading(true);
        setError("");

        fetch(`/api/posts/${postId}/comments`)
            .then(async (res) => {
                if (!res.ok) {
                    throw new Error("Failed to fetch comments");
                }
                return res.json();
            })
            .then((data) => {
                if (active) {
                    setComments(Array.isArray(data) ? data : []);
                }
            })
            .catch(() => {
                if (active) {
                    setError(locale.fetchFailed);
                }
            })
            .finally(() => {
                if (active) {
                    setLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [postId, locale.fetchFailed]);

    const submitComment = async () => {
        const content = newComment.trim();
        if (!postId || submitting) return;

        if (!isSignedIn) {
            setError(locale.loginRequired);
            return;
        }

        if (!content || content.length > COMMENT_LIMIT) {
            setError(locale.invalidLength);
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const res = await fetch(`/api/posts/${postId}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(payload.error || locale.submitFailed);
                return;
            }

            setComments((prev) => [payload, ...prev]);
            setNewComment("");
        } catch {
            setError(locale.submitFailed);
        } finally {
            setSubmitting(false);
        }
    };

    const startEdit = (comment: PostComment) => {
        setEditingId(comment.id);
        setEditingContent(comment.content);
        setError("");
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditingContent("");
    };

    const saveEdit = async (commentId: string) => {
        if (!postId || savingEditId) return;

        const content = editingContent.trim();
        if (!content || content.length > COMMENT_LIMIT) {
            setError(locale.invalidLength);
            return;
        }

        setSavingEditId(commentId);
        setError("");

        try {
            const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(payload.error || locale.updateFailed);
                return;
            }

            setComments((prev) => prev.map((comment) => (comment.id === commentId ? payload : comment)));
            setEditingId(null);
            setEditingContent("");
        } catch {
            setError(locale.updateFailed);
        } finally {
            setSavingEditId(null);
        }
    };

    const deleteComment = async (commentId: string) => {
        if (!postId || deletingId) return;
        if (!confirm(locale.deleteConfirm)) return;

        setDeletingId(commentId);
        setError("");

        try {
            const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
                method: "DELETE",
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(payload.error || locale.deleteFailed);
                return;
            }

            setComments((prev) => prev.filter((comment) => comment.id !== commentId));
            if (editingId === commentId) {
                setEditingId(null);
                setEditingContent("");
            }
        } catch {
            setError(locale.deleteFailed);
        } finally {
            setDeletingId(null);
        }
    };

    if (!postId) return null;

    return (
        <section style={{ marginTop: 40, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
            <h3 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 400, marginBottom: 10 }}>{locale.title}</h3>

            {isSignedIn ? (
                <div style={{ marginBottom: 16 }}>
                    <textarea
                        className="login-input"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder={locale.placeholder}
                        rows={4}
                        style={{ resize: "vertical", marginBottom: 10, fontFamily: "var(--sans)" }}
                    />

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                            type="button"
                            className="editor-btn editor-btn-primary"
                            disabled={submitting || !newComment.trim()}
                            onClick={submitComment}
                            style={{ padding: "8px 16px", fontSize: 12 }}
                        >
                            {submitting ? locale.posting : locale.post}
                        </button>
                    </div>
                </div>
            ) : (
                <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 12 }}>{locale.loginRequired}</p>
            )}

            {error && (
                <div className="login-message login-error" style={{ marginBottom: 12 }}>
                    {error}
                </div>
            )}

            {loading ? (
                <p style={{ fontSize: 13, color: "var(--text-soft)" }}>{locale.loading}</p>
            ) : comments.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-soft)" }}>{locale.empty}</p>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {comments.map((comment) => {
                        const canManage = !!currentUserId && comment.author.id === currentUserId;
                        const isEditing = editingId === comment.id;
                        const isSavingThis = savingEditId === comment.id;
                        const isDeletingThis = deletingId === comment.id;
                        const authorName = comment.author?.name || comment.author?.email || "Anonymous";
                        const avatarFallback = authorName.charAt(0).toUpperCase();

                        return (
                            <article
                                key={comment.id}
                                style={{
                                    padding: "12px 14px",
                                    border: "1px solid var(--border)",
                                    borderRadius: 10,
                                    background: "var(--card)",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        gap: 12,
                                        marginBottom: 6,
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                        <div
                                            style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: "50%",
                                                border: "1px solid var(--border)",
                                                background: "var(--bg-soft)",
                                                color: "var(--azuki)",
                                                overflow: "hidden",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexShrink: 0,
                                                fontSize: 11,
                                                fontWeight: 600,
                                            }}
                                        >
                                            {comment.author?.image ? (
                                                <img
                                                    src={comment.author.image}
                                                    alt={authorName}
                                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                />
                                            ) : (
                                                avatarFallback
                                            )}
                                        </div>
                                        <p
                                            style={{
                                                fontSize: 12,
                                                color: "var(--text-soft)",
                                                margin: 0,
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                            }}
                                        >
                                            {authorName} ・ {new Date(comment.createdAt).toLocaleString("ja-JP")}
                                        </p>
                                    </div>
                                    {canManage && !isEditing && (
                                        <div style={{ display: "flex", gap: 6 }}>
                                            <button
                                                type="button"
                                                className="editor-btn editor-btn-secondary"
                                                onClick={() => startEdit(comment)}
                                                style={{ padding: "2px 8px", fontSize: 11 }}
                                            >
                                                {locale.edit}
                                            </button>
                                            <button
                                                type="button"
                                                className="editor-btn editor-btn-danger"
                                                onClick={() => deleteComment(comment.id)}
                                                disabled={isDeletingThis}
                                                style={{ padding: "2px 8px", fontSize: 11 }}
                                            >
                                                {locale.delete}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {isEditing ? (
                                    <div>
                                        <textarea
                                            className="login-input"
                                            value={editingContent}
                                            onChange={(e) => setEditingContent(e.target.value)}
                                            rows={3}
                                            style={{ resize: "vertical", marginBottom: 8, fontFamily: "var(--sans)" }}
                                        />
                                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                                            <button
                                                type="button"
                                                className="editor-btn editor-btn-secondary"
                                                onClick={cancelEdit}
                                                disabled={isSavingThis}
                                                style={{ padding: "2px 8px", fontSize: 11 }}
                                            >
                                                {locale.cancel}
                                            </button>
                                            <button
                                                type="button"
                                                className="editor-btn editor-btn-primary"
                                                onClick={() => saveEdit(comment.id)}
                                                disabled={isSavingThis || !editingContent.trim()}
                                                style={{ padding: "2px 8px", fontSize: 11 }}
                                            >
                                                {isSavingThis ? locale.saving : locale.save}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7, margin: 0 }}>{comment.content}</p>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
