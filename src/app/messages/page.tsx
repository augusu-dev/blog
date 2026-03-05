/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markDmPrSeen } from "@/lib/dmUnreadClient";

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
    pending?: boolean;
};

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
    const [sending, setSending] = useState(false);
    const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [presetTarget, setPresetTarget] = useState("");

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
            if (!selectedUser) {
                setSelectedUser(otherUser);
            }
        },
        [currentUserId, selectedUser]
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
        loadThreads();
    }, [currentUserId, loadThreads]);

    useEffect(() => {
        if (!currentUserId) return;
        markDmPrSeen();
    }, [currentUserId]);

    useEffect(() => {
        if (!selectedUserId) {
            setMessages([]);
            setSelectedUser(null);
            return;
        }

        const cachedUser = threads.find((thread) => thread.id === selectedUserId)?.user || null;
        setSelectedUser(cachedUser);

        let active = true;
        setLoadingMessages(true);
        setError("");

        Promise.all([
            fetch(`/api/direct-messages?mode=thread&userId=${encodeURIComponent(selectedUserId)}`),
            cachedUser ? Promise.resolve(null) : fetch(`/api/user/${encodeURIComponent(selectedUserId)}`),
        ])
            .then(async ([threadRes, userRes]) => {
                const threadPayload = await threadRes.json().catch(() => ({}));
                if (!threadRes.ok) {
                    throw new Error(threadPayload.error || "Failed to load message history.");
                }

                if (!active) return;
                setMessages(Array.isArray(threadPayload.messages) ? threadPayload.messages : []);

                if (userRes && userRes.ok) {
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
    }, [selectedUserId, threads]);

    const refreshCurrentThread = useCallback(async () => {
        if (!selectedUserId) return;
        try {
            const res = await fetch(`/api/direct-messages?mode=thread&userId=${encodeURIComponent(selectedUserId)}`);
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) return;
            setMessages(Array.isArray(payload.messages) ? payload.messages : []);
        } catch {
            // silent refresh failure
        }
    }, [selectedUserId]);

    const sendMessage = async () => {
        const content = draft.trim();
        if (!selectedUserId || !content || sending) return;

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
            pending: true,
        };

        setDraft("");
        setMessages((prev) => [...prev, optimisticMessage]);
        syncThreadFromMessage(optimisticMessage);

        setSending(true);
        setError("");
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
        } finally {
            setSending(false);
        }
    };

    const deleteMessage = async (messageId: string) => {
        if (!messageId || deletingMessageId) return;
        if (!confirm("このメッセージを取り消しますか？")) return;

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

            <div className="editor-container" style={{ maxWidth: 1000 }}>
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 400, marginBottom: 18 }}>DM</h1>

                {error && <div className="login-message login-error" style={{ marginBottom: 12 }}>{error}</div>}

                <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14 }}>
                    <aside style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)" }}>
                        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-soft)" }}>
                            会話一覧
                        </div>
                        <div style={{ maxHeight: 520, overflow: "auto" }}>
                            {loadingThreads ? (
                                <p style={{ fontSize: 12, color: "var(--text-soft)", padding: 12 }}>読み込み中...</p>
                            ) : threads.length === 0 ? (
                                <p style={{ fontSize: 12, color: "var(--text-soft)", padding: 12 }}>会話履歴はありません。</p>
                            ) : (
                                threads.map((thread) => {
                                    const active = selectedUserId === thread.id;
                                    const name = thread.user.name || thread.user.email || thread.id;
                                    return (
                                        <button
                                            key={thread.id}
                                            type="button"
                                            onClick={() => setSelectedUserId(thread.id)}
                                            style={{
                                                width: "100%",
                                                textAlign: "left",
                                                border: "none",
                                                borderBottom: "1px solid var(--border)",
                                                background: active ? "var(--bg-soft)" : "transparent",
                                                padding: "10px 12px",
                                                cursor: "pointer",
                                            }}
                                        >
                                            <div style={{ fontSize: 13, marginBottom: 3, color: "var(--text)" }}>{name}</div>
                                            <div style={{ fontSize: 11, color: "var(--text-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                {thread.lastMessage.content}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </aside>

                    <section style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", display: "flex", flexDirection: "column", minHeight: 520 }}>
                        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {selectedUser?.id ? (
                                    <Link href={`/user/${encodeURIComponent(selectedUser.userId || selectedUser.id)}`} style={{ textDecoration: "none" }}>
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
                                                fontSize: 11,
                                                fontWeight: 600,
                                            }}
                                        >
                                            {selectedUser.image ? (
                                                <img src={selectedUser.image} alt={selectedUser.name || "user"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                            ) : (
                                                (selectedUser.name || selectedUser.email || "U").charAt(0).toUpperCase()
                                            )}
                                        </div>
                                    </Link>
                                ) : null}
                                <div style={{ fontSize: 13, color: "var(--text)" }}>
                                    {selectedUser ? (selectedUser.name || selectedUser.email || selectedUser.id) : "会話相手を選択"}
                                </div>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                            {loadingMessages ? (
                                <p style={{ fontSize: 12, color: "var(--text-soft)" }}>読み込み中...</p>
                            ) : !selectedUserId ? (
                                <p style={{ fontSize: 12, color: "var(--text-soft)" }}>左の一覧からユーザーを選んでください。</p>
                            ) : messages.length === 0 ? (
                                <p style={{ fontSize: 12, color: "var(--text-soft)" }}>まだメッセージはありません。</p>
                            ) : (
                                messages.map((message) => {
                                    const mine = message.senderId === currentUserId;
                                    const isPending = !!message.pending || message.id.startsWith("temp-");
                                    const deletingThis = deletingMessageId === message.id;
                                    return (
                                        <div key={message.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%" }}>
                                            <div
                                                style={{
                                                    border: "1px solid var(--border)",
                                                    background: mine ? "rgba(155,107,107,0.08)" : "var(--bg-card)",
                                                    borderRadius: 10,
                                                    padding: "8px 10px",
                                                    fontSize: 13,
                                                    lineHeight: 1.6,
                                                    whiteSpace: "pre-wrap",
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
                                                    marginTop: 2,
                                                }}
                                            >
                                                <span style={{ fontSize: 10, color: "var(--text-soft)" }}>
                                                    {isPending
                                                        ? "送信中..."
                                                        : new Date(message.createdAt).toLocaleString("ja-JP")}
                                                </span>
                                                {mine && !isPending ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => void deleteMessage(message.id)}
                                                        disabled={deletingThis}
                                                        className="editor-btn editor-btn-secondary"
                                                        style={{ padding: "1px 6px", fontSize: 10 }}
                                                    >
                                                        {deletingThis ? "取消中..." : "取り消し"}
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div style={{ borderTop: "1px solid var(--border)", padding: 10 }}>
                            <textarea
                                className="login-input"
                                rows={3}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder={selectedUserId ? "メッセージを入力..." : "会話相手を選択してください"}
                                disabled={!selectedUserId || sending}
                                style={{ marginBottom: 8, resize: "vertical", fontFamily: "var(--sans)" }}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "var(--text-soft)" }}>{draft.length}/10000</span>
                                <button
                                    type="button"
                                    className="editor-btn editor-btn-primary"
                                    disabled={!selectedUserId || sending || !draft.trim()}
                                    onClick={sendMessage}
                                >
                                    {sending ? "送信中..." : "送信"}
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </>
    );
}
