"use client";

import { useEffect, useState } from "react";

interface PostComment {
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    author: {
        id: string;
        name: string | null;
        email: string | null;
    };
}

interface PostCommentsProps {
    postId: string | null;
    isSignedIn: boolean;
}

const COMMENT_LIMIT = 1000;

export default function PostComments({ postId, isSignedIn }: PostCommentsProps) {
    const [comments, setComments] = useState<PostComment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!postId || !isSignedIn) {
            setComments([]);
            setNewComment("");
            setError("");
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
                    setError("コメントの取得に失敗しました。");
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
    }, [postId, isSignedIn]);

    const submitComment = async () => {
        const content = newComment.trim();
        if (!postId || !content || content.length > COMMENT_LIMIT || submitting) {
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
                setError(payload.error || "コメントの投稿に失敗しました。");
                return;
            }

            setComments((prev) => [payload, ...prev]);
            setNewComment("");
        } catch {
            setError("コメントの投稿に失敗しました。");
        } finally {
            setSubmitting(false);
        }
    };

    if (!postId) return null;

    return (
        <section style={{ marginTop: 40, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
            <h3 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 400, marginBottom: 10 }}>Comments</h3>

            {!isSignedIn ? (
                <p style={{ fontSize: 13, color: "var(--text-soft)" }}>
                    コメントの閲覧・投稿はログイン後に利用できます。
                </p>
            ) : (
                <>
                    <textarea
                        className="login-input"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="コメントを書く"
                        rows={4}
                        style={{ resize: "vertical", marginBottom: 10, fontFamily: "var(--sans)" }}
                    />

                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                        <button
                            type="button"
                            className="editor-btn editor-btn-primary"
                            disabled={submitting || !newComment.trim()}
                            onClick={submitComment}
                            style={{ padding: "8px 16px", fontSize: 12 }}
                        >
                            {submitting ? "投稿中..." : "コメント投稿"}
                        </button>
                    </div>

                    {error && (
                        <div className="login-message login-error" style={{ marginBottom: 12 }}>
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>読み込み中...</p>
                    ) : comments.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>まだコメントはありません。</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {comments.map((comment) => (
                                <article
                                    key={comment.id}
                                    style={{
                                        padding: "12px 14px",
                                        border: "1px solid var(--border)",
                                        borderRadius: 10,
                                        background: "var(--card)",
                                    }}
                                >
                                    <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>
                                        {comment.author?.name || comment.author?.email || "Anonymous"} ・ {new Date(comment.createdAt).toLocaleString("ja-JP")}
                                    </p>
                                    <p style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7 }}>{comment.content}</p>
                                </article>
                            ))}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}