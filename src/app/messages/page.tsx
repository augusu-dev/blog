/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getDmUnreadSince, markDmPrSeen } from "@/lib/dmUnreadClient";

type ThreadUser = {
    id: string;
    userId?: string | null;
    name: string | null;
    email: string | null;
    image: string | null;
};

type Thread = {
    id: string;
    user: ThreadUser;
    lastMessage: {
        id: string;
        content: string;
        createdAt: string;
        senderId: string;
        recipientId: string;
    };
};

type DirectMessage = {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    recipientId: string;
    sender: ThreadUser;
    recipient: ThreadUser;
    goodCount?: number;
    likedByMe?: boolean;
    pending?: boolean;
};

function formatMessageTime(value: string): string {
    if (!value) return "";

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

export default function MessagesPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [threads, setThreads] = useState<Thread[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [selectedUser, setSelectedUser] = useState<ThreadUser | null>(null);
    const [messages, setMessages] = useState<DirectMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [loadingThreads, setLoadingThreads] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
    const [togglingGoodId, setTogglingGoodId] = useState<string | null>(null);
    const [goodPulseId, setGoodPulseId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [presetTarget, setPresetTarget] = useState("");
    const [threadDrawerOpen, setThreadDrawerOpen] = useState(false);
    const [unreadDmCount, setUnreadDmCount] = useState(0);

    const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? "";
    const sessionUser = session?.user as {
        id?: string;
        userId?: string | null;
        name?: string | null;
        email?: string | null;
        image?: string | null;
    } | undefined;

    const syncThreadFromMessage = useCallback(
        (nextMessage: DirectMessage) => {
            const otherUser =
                nextMessage.senderId === currentUserId ? nextMessage.recipient : nextMessage.sender;
            if (!otherUser?.id) return;

            const nextThread: Thread = {
                id: otherUser.id,
                user: otherUser,
                lastMessage: {
                    id: nextMessage.id,
                    content: nextMessage.content,
                    createdAt: nextMessage.createdAt,
                    senderId: nextMessage.senderId,
                    recipientId: nextMessage.recipientId,
                },
            };

            setThreads((prev) => [nextThread, ...prev.filter((thread) => thread.id !== otherUser.id)]);
            setSelectedUser((current) => current || otherUser);
        },
        [currentUserId]
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        const to = new URLSearchParams(window.location.search).get("to")?.trim() || "";
        setPresetTarget(to);
    }, []);

    useEffect(() => {
        if (!presetTarget) return;
        setSelectedUserId(presetTarget);
    }, [presetTarget]);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [router, status]);

    useEffect(() => {
        if (!threadDrawerOpen || typeof document === "undefined") return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [threadDrawerOpen]);

    const loadThreads = useCallback(async () => {
        if (!currentUserId) return;

        setError("");
        setLoadingThreads(true);
        try {
            const res = await fetch("/api/direct-messages?mode=threads");
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(payload.error || "Failed to load conversations.");
                return;
            }

            const nextThreads = Array.isArray(payload.threads) ? (payload.threads as Thread[]) : [];
            setThreads(nextThreads);

            if (presetTarget) {
                setSelectedUserId(presetTarget);
            } else if (nextThreads[0]) {
                setSelectedUserId((current) => current || nextThreads[0].id);
            }
        } catch {
            setError("Failed to load conversations.");
        } finally {
            setLoadingThreads(false);
        }
    }, [currentUserId, presetTarget]);

    useEffect(() => {
        if (!currentUserId) return;
        void loadThreads();
    }, [currentUserId, loadThreads]);

    useEffect(() => {
        if (!currentUserId) {
            setUnreadDmCount(0);
            return;
        }

        const loadUnreadDmCount = async () => {
            const since = getDmUnreadSince();
            const url = since
                ? `/api/notifications/unread?since=${encodeURIComponent(since)}`
                : "/api/notifications/unread";

            try {
                const res = await fetch(url, { cache: "no-store" });
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) return;
                const nextUnreadCount = Number(payload.dm || 0);
                setUnreadDmCount(Number.isFinite(nextUnreadCount) && nextUnreadCount > 0 ? nextUnreadCount : 0);
            } catch {
                // keep previous unread count
            }
        };

        void loadUnreadDmCount();
    }, [currentUserId]);

    useEffect(() => {
        if (!currentUserId) return;
        markDmPrSeen();
    }, [currentUserId]);

    useEffect(() => {
        if (!selectedUserId) {
            setSelectedUser(null);
            return;
        }

        const cachedUser = threads.find((thread) => thread.id === selectedUserId)?.user || null;
        if (cachedUser) {
            setSelectedUser(cachedUser);
        }
    }, [selectedUserId, threads]);

    useEffect(() => {
        if (!selectedUserId) {
            setMessages([]);
            setSelectedUser(null);
            return;
        }

        setThreadDrawerOpen(false);

        let active = true;
        setLoadingMessages(true);
        setError("");

        Promise.all([
            fetch(`/api/direct-messages?mode=thread&userId=${encodeURIComponent(selectedUserId)}`),
            fetch(`/api/user/${encodeURIComponent(selectedUserId)}`),
        ])
            .then(async ([threadRes, userRes]) => {
                const threadPayload = await threadRes.json().catch(() => ({}));
                if (!threadRes.ok) {
                    throw new Error(threadPayload.error || "Failed to load message history.");
                }

                if (!active) return;
                setMessages(Array.isArray(threadPayload.messages) ? threadPayload.messages : []);

                if (userRes.ok) {
                    const profile = await userRes.json();
                    if (!active) return;
                    setSelectedUser({
                        id: profile.id,
                        userId: profile.userId || null,
                        name: profile.name || null,
                        email: profile.email || null,
                        image: profile.image || null,
                    });
                }
            })
            .catch((err: unknown) => {
                if (!active) return;
                setMessages([]);
                setError(err instanceof Error ? err.message : "Failed to load message history.");
            })
            .finally(() => {
                if (active) setLoadingMessages(false);
            });

        return () => {
            active = false;
        };
    }, [selectedUserId]);

    const refreshCurrentThread = useCallback(async () => {
        if (!selectedUserId) return;
        try {
            const res = await fetch(`/api/direct-messages?mode=thread&userId=${encodeURIComponent(selectedUserId)}`);
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) return;
            setMessages(Array.isArray(payload.messages) ? payload.messages : []);
        } catch {
            // ignore silent refresh failures
        }
    }, [selectedUserId]);

    const handleDraftKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) {
            return;
        }

        if (event.ctrlKey) {
            return;
        }

        event.preventDefault();
        if (!selectedUserId || !draft.trim()) {
            return;
        }

        void sendMessage();
    };

    const sendMessage = async () => {
        const content = draft.trim();
        if (!selectedUserId || !content) return;

        if (content.length > 10000) {
            setError("Message must be 10000 characters or fewer.");
            return;
        }

        const recipientFromThread =
            selectedUser || threads.find((thread) => thread.id === selectedUserId)?.user || null;
        const fallbackRecipient: ThreadUser = recipientFromThread || {
            id: selectedUserId,
            userId: null,
            name: null,
            email: null,
            image: null,
        };
        const senderUser: ThreadUser = {
            id: currentUserId,
            userId: sessionUser?.userId ?? null,
            name: sessionUser?.name ?? null,
            email: sessionUser?.email ?? null,
            image: sessionUser?.image ?? null,
        };

        const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimisticMessage: DirectMessage = {
            id: optimisticId,
            content,
            createdAt: new Date().toISOString(),
            senderId: currentUserId,
            recipientId: selectedUserId,
            sender: senderUser,
            recipient: fallbackRecipient,
            goodCount: 0,
            likedByMe: false,
            pending: true,
        };

        setDraft("");
        setError("");
        setMessages((prev) => [...prev, optimisticMessage]);
        syncThreadFromMessage(optimisticMessage);

        try {
            const res = await fetch("/api/direct-messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipientId: selectedUserId, content }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMessages((prev) => prev.filter((message) => message.id !== optimisticId));
                setDraft((prev) => (prev ? prev : content));
                setError(payload.error || "Failed to send message.");
                void loadThreads();
                return;
            }

            if (payload && typeof payload === "object" && typeof payload.id === "string") {
                const nextMessage = payload as DirectMessage;
                setMessages((prev) =>
                    prev.map((message) => (message.id === optimisticId ? nextMessage : message))
                );
                syncThreadFromMessage(nextMessage);
            } else {
                setMessages((prev) => prev.filter((message) => message.id !== optimisticId));
                await refreshCurrentThread();
            }

            markDmPrSeen();
            void loadThreads();
        } catch {
            setMessages((prev) => prev.filter((message) => message.id !== optimisticId));
            setDraft((prev) => (prev ? prev : content));
            setError("Failed to send message.");
            void loadThreads();
        }
    };

    const toggleGood = async (messageId: string) => {
        if (!messageId || togglingGoodId) return;

        const current = messages.find((message) => message.id === messageId);
        if (!current || current.pending || current.senderId === currentUserId) {
            return;
        }

        const optimisticLiked = !current.likedByMe;
        const optimisticCount = Math.max(
            0,
            Number(current.goodCount || 0) + (optimisticLiked ? 1 : -1)
        );

        setTogglingGoodId(messageId);
        setGoodPulseId(messageId);
        setMessages((prev) =>
            prev.map((message) =>
                message.id === messageId
                    ? {
                          ...message,
                          likedByMe: optimisticLiked,
                          goodCount: optimisticCount,
                      }
                    : message
            )
        );

        window.setTimeout(() => {
            setGoodPulseId((currentPulse) => (currentPulse === messageId ? null : currentPulse));
        }, 180);

        try {
            const res = await fetch(`/api/direct-messages/${encodeURIComponent(messageId)}/good`, {
                method: "POST",
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload.error || "Failed to react to message.");
            }

            setMessages((prev) =>
                prev.map((message) =>
                    message.id === messageId
                        ? {
                              ...message,
                              goodCount: Number(payload.goodCount || 0),
                              likedByMe: !!payload.likedByMe,
                          }
                        : message
                )
            );
        } catch (err) {
            setMessages((prev) =>
                prev.map((message) =>
                    message.id === messageId
                        ? {
                              ...message,
                              likedByMe: !!current.likedByMe,
                              goodCount: Number(current.goodCount || 0),
                          }
                        : message
                )
            );
            setError(err instanceof Error ? err.message : "Failed to react to message.");
        } finally {
            setTogglingGoodId(null);
        }
    };

    const deleteMessage = async (messageId: string) => {
        if (!messageId || deletingMessageId) return;
        if (!confirm("このメッセージを削除しますか？")) return;

        if (messageId.startsWith("temp-")) {
            setMessages((prev) => prev.filter((message) => message.id !== messageId));
            return;
        }

        setDeletingMessageId(messageId);
        setError("");
        try {
            const res = await fetch(`/api/direct-messages/${encodeURIComponent(messageId)}`, {
                method: "DELETE",
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(payload.error || "Failed to delete message.");
                return;
            }

            setMessages((prev) => prev.filter((message) => message.id !== messageId));
            await refreshCurrentThread();
            void loadThreads();
        } catch {
            setError("Failed to delete message.");
        } finally {
            setDeletingMessageId(null);
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

    if (!session) return null;

    return (
        <>
            <nav className="navbar" style={{ justifyContent: "space-between" }}>
                <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>
                    <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                    Next Blog <span className="beta-badge">β</span>
                </Link>
                <div className="nav-auth">
                    <Link href="/settings" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                        ⚙
                    </Link>
                </div>
            </nav>

            <div className="editor-container" style={{ maxWidth: 980 }}>
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 400, marginBottom: 18 }}>DM</h1>

                {error && <div className="login-message login-error" style={{ marginBottom: 12 }}>{error}</div>}

                <section
                    style={{
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        background: "var(--card)",
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 560,
                        overflow: "hidden",
                    }}
                >
                    <div
                        className="dm-header-bar"
                        style={{
                            padding: "12px 14px",
                            borderBottom: "1px solid var(--border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <button
                                type="button"
                                className="dm-thread-menu-btn"
                                onClick={() => setThreadDrawerOpen(true)}
                                aria-label="会話一覧を開く"
                                title="会話一覧"
                            >
                                <span />
                                <span />
                                <span />
                            </button>
                            <span
                                style={{
                                    fontSize: 11,
                                    color: unreadDmCount > 0 ? "#fff" : "var(--text-soft)",
                                    background: unreadDmCount > 0 ? "#d35b5b" : "var(--bg-soft)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 999,
                                    padding: "3px 8px",
                                    lineHeight: 1,
                                    whiteSpace: "nowrap",
                                    flexShrink: 0,
                                }}
                            >
                                未読 {unreadDmCount}
                            </span>
                            {selectedUser?.id ? (
                                <Link
                                    href={`/user/${encodeURIComponent(selectedUser.userId || selectedUser.id)}`}
                                    style={{ textDecoration: "none" }}
                                >
                                    <div
                                        style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: "50%",
                                            border: "1px solid var(--border)",
                                            background: "var(--bg-soft)",
                                            color: "var(--azuki)",
                                            overflow: "hidden",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 11,
                                            fontWeight: 600,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {selectedUser.image ? (
                                            <img
                                                src={selectedUser.image}
                                                alt={selectedUser.name || "user"}
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                            />
                                        ) : (
                                            (selectedUser.name || selectedUser.email || "U").charAt(0).toUpperCase()
                                        )}
                                    </div>
                                </Link>
                            ) : null}
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 1 }}>会話先</div>
                                <div
                                    style={{
                                        fontSize: 14,
                                        color: "var(--text)",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {selectedUser ? (selectedUser.name || selectedUser.email || selectedUser.id) : "会話相手を選択してください"}
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="editor-btn editor-btn-secondary"
                            style={{ padding: "6px 10px", fontSize: 12 }}
                            onClick={() => setThreadDrawerOpen(true)}
                        >
                            会話一覧
                        </button>
                    </div>

                    <div style={{ flex: 1, overflow: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                        {loadingMessages ? (
                            <p style={{ fontSize: 12, color: "var(--text-soft)" }}>読み込み中...</p>
                        ) : !selectedUserId ? (
                            <p style={{ fontSize: 12, color: "var(--text-soft)" }}>左上の三本線から会話相手を選んでください。</p>
                        ) : messages.length === 0 ? (
                            <p style={{ fontSize: 12, color: "var(--text-soft)" }}>まだメッセージはありません。</p>
                        ) : (
                            messages.map((message) => {
                                const mine = message.senderId === currentUserId;
                                const isPending = !!message.pending || message.id.startsWith("temp-");
                                const deletingThis = deletingMessageId === message.id;
                                const togglingThis = togglingGoodId === message.id;
                                const goodCount = Number(message.goodCount || 0);

                                return (
                                    <div
                                        key={message.id}
                                        style={{
                                            alignSelf: mine ? "flex-end" : "flex-start",
                                            maxWidth: "min(78%, 640px)",
                                        }}
                                    >
                                        <div
                                            style={{
                                                border: "1px solid var(--border)",
                                                background: mine ? "rgba(155,107,107,0.08)" : "var(--bg-card)",
                                                borderRadius: 12,
                                                padding: "10px 12px",
                                                fontSize: 13,
                                                lineHeight: 1.65,
                                                whiteSpace: "pre-wrap",
                                                opacity: isPending ? 0.88 : 1,
                                            }}
                                        >
                                            {message.content}
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: mine ? "flex-end" : "flex-start",
                                                gap: 8,
                                                marginTop: 4,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <span style={{ fontSize: 10, color: "var(--text-soft)" }}>
                                                {formatMessageTime(message.createdAt)}
                                            </span>
                                            {!mine && !isPending ? (
                                                <button
                                                    type="button"
                                                    onClick={() => void toggleGood(message.id)}
                                                    disabled={togglingThis}
                                                    className="editor-btn editor-btn-secondary"
                                                    style={{
                                                        padding: "2px 9px",
                                                        fontSize: 11,
                                                        borderColor: message.likedByMe ? "var(--azuki)" : undefined,
                                                        color: message.likedByMe ? "var(--azuki-deep)" : undefined,
                                                        background: message.likedByMe ? "rgba(155,107,107,0.1)" : undefined,
                                                        transform: goodPulseId === message.id ? "scale(1.08)" : "scale(1)",
                                                        transition: "transform 0.18s ease, background 0.18s ease",
                                                    }}
                                                >
                                                    {goodCount > 0 ? `👍 ${goodCount}` : "👍"}
                                                </button>
                                            ) : null}
                                            {mine && goodCount > 0 ? (
                                                <span style={{ fontSize: 11, color: "var(--azuki)" }}>{`👍 ${goodCount}`}</span>
                                            ) : null}
                                            {mine && !isPending ? (
                                                <button
                                                    type="button"
                                                    onClick={() => void deleteMessage(message.id)}
                                                    disabled={deletingThis}
                                                    className="editor-btn editor-btn-secondary"
                                                    style={{ padding: "2px 7px", fontSize: 10 }}
                                                >
                                                    {deletingThis ? "削除中..." : "削除"}
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div style={{ borderTop: "1px solid var(--border)", padding: 12 }}>
                        <textarea
                            className="login-input"
                            rows={3}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={handleDraftKeyDown}
                            placeholder={selectedUserId ? "メッセージを入力..." : "会話相手を選択してください"}
                            disabled={!selectedUserId}
                            style={{ marginBottom: 8, resize: "vertical", fontFamily: "var(--sans)" }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                            <span style={{ fontSize: 11, color: "var(--text-soft)" }}>{draft.length}/10000</span>
                            <button
                                type="button"
                                className="editor-btn editor-btn-primary"
                                disabled={!selectedUserId || !draft.trim()}
                                onClick={sendMessage}
                            >
                                送信
                            </button>
                        </div>
                    </div>
                </section>
            </div>

            {threadDrawerOpen ? (
                <div className="dm-thread-drawer-backdrop" onClick={() => setThreadDrawerOpen(false)}>
                    <aside className="dm-thread-drawer" onClick={(event) => event.stopPropagation()}>
                        <div className="dm-thread-drawer-header">
                            <div>
                                <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 2 }}>DM</div>
                                <div style={{ fontSize: 16, color: "var(--text)", fontWeight: 600 }}>会話一覧</div>
                            </div>
                            <button
                                type="button"
                                className="dm-thread-close-btn"
                                onClick={() => setThreadDrawerOpen(false)}
                                aria-label="閉じる"
                            >
                                ×
                            </button>
                        </div>

                        <div style={{ padding: "0 12px 12px" }}>
                            {loadingThreads ? (
                                <p style={{ fontSize: 12, color: "var(--text-soft)", padding: "8px 2px" }}>読み込み中...</p>
                            ) : threads.length === 0 ? (
                                <p style={{ fontSize: 12, color: "var(--text-soft)", padding: "8px 2px" }}>会話履歴はありません。</p>
                            ) : (
                                threads.map((thread) => {
                                    const active = selectedUserId === thread.id;
                                    const name = thread.user.name || thread.user.email || thread.id;
                                    return (
                                        <button
                                            key={thread.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedUserId(thread.id);
                                                setThreadDrawerOpen(false);
                                            }}
                                            className="dm-thread-row"
                                            style={{
                                                background: active ? "var(--bg-soft)" : "transparent",
                                            }}
                                        >
                                            <div style={{ fontSize: 13, marginBottom: 3, color: "var(--text)" }}>{name}</div>
                                            <div
                                                style={{
                                                    fontSize: 11,
                                                    color: "var(--text-soft)",
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                }}
                                            >
                                                {thread.lastMessage.content}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </aside>
                </div>
            ) : null}
        </>
    );
}
