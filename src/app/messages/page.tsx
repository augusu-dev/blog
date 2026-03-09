/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markDmPrSeen } from "@/lib/dmUnreadClient";
import { readSessionCache, writeSessionCache } from "@/lib/clientSessionCache";

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

const DM_THREADS_CACHE_TTL_MS = 60 * 1000;
const DM_THREAD_CACHE_TTL_MS = 60 * 1000;

function buildDmThreadsCacheKey(userId: string): string {
    return `dm-threads-cache:${userId}`;
}

function buildDmThreadCacheKey(userId: string, threadId: string): string {
    return `dm-thread-cache:${userId}:${threadId}`;
}

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
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const messageListRef = useRef<HTMLDivElement | null>(null);
    const threadMessagesCacheRef = useRef<Map<string, DirectMessage[]>>(new Map());
    const threadUserCacheRef = useRef<Map<string, ThreadUser>>(new Map());
    const restoredThreadsRef = useRef(false);

    const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? "";
    const sessionUser = session?.user as {
        id?: string;
        userId?: string | null;
        name?: string | null;
        email?: string | null;
        image?: string | null;
    } | undefined;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const persistThreads = useCallback(
        (nextThreads: Thread[]) => {
            if (!currentUserId) return;
            writeSessionCache(buildDmThreadsCacheKey(currentUserId), nextThreads);
        },
        [currentUserId]
    );

    const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
        const node = messageListRef.current;
        if (!node) return;
        node.scrollTo({ top: node.scrollHeight, behavior });
    }, []);

    const cacheThreadUser = useCallback((user: ThreadUser | null | undefined) => {
        if (!user?.id) return;
        threadUserCacheRef.current.set(user.id, user);
    }, []);

    const replaceMessagesForThread = useCallback((threadId: string, nextMessages: DirectMessage[]) => {
        threadMessagesCacheRef.current.set(threadId, nextMessages);
        if (currentUserId) {
            writeSessionCache(buildDmThreadCacheKey(currentUserId, threadId), nextMessages);
        }
        setMessages(nextMessages);
    }, [currentUserId]);

    const updateCurrentThreadMessages = useCallback(
        (updater: (previous: DirectMessage[]) => DirectMessage[]) => {
            setMessages((previous) => {
                const nextMessages = updater(previous);
                if (selectedUserId) {
                    threadMessagesCacheRef.current.set(selectedUserId, nextMessages);
                    if (currentUserId) {
                        writeSessionCache(buildDmThreadCacheKey(currentUserId, selectedUserId), nextMessages);
                    }
                }
                return nextMessages;
            });
        },
        [currentUserId, selectedUserId]
    );

    const deriveThreadUserFromMessages = useCallback((items: DirectMessage[], threadUserId: string) => {
        for (const item of items) {
            if (item.sender?.id === threadUserId) return item.sender;
            if (item.recipient?.id === threadUserId) return item.recipient;
        }
        return null;
    }, []);

    const fetchReadWithRetry = useCallback(
        async (input: string, attempts = 2): Promise<Response> => {
            let lastResponse: Response | null = null;

            for (let attempt = 0; attempt < attempts; attempt += 1) {
                try {
                    const response = await fetch(input, {
                        cache: "no-store",
                        credentials: "same-origin",
                    });
                    lastResponse = response;

                    const shouldRetry =
                        (response.status === 401 && status === "authenticated") ||
                        response.status >= 500;

                    if (!shouldRetry || attempt === attempts - 1) {
                        return response;
                    }
                } catch (error) {
                    if (attempt === attempts - 1) {
                        throw error;
                    }
                }

                await wait(80 * (attempt + 1));
            }

            return lastResponse as Response;
        },
        [status]
    );

    const warmThreadCache = useCallback(
        async (threadIds: string[]) => {
            const uniqueThreadIds = [...new Set(threadIds.filter(Boolean))].slice(0, 3);

            await Promise.all(
                uniqueThreadIds.map(async (threadId) => {
                    if (threadMessagesCacheRef.current.has(threadId)) {
                        return;
                    }

                    try {
                        const res = await fetchReadWithRetry(
                            `/api/direct-messages?mode=thread&userId=${encodeURIComponent(threadId)}`,
                            1
                        );
                        const payload = await res.json().catch(() => ({}));
                        if (!res.ok) {
                            return;
                        }

                        const nextMessages = Array.isArray(payload.messages)
                            ? (payload.messages as DirectMessage[])
                            : [];
                        threadMessagesCacheRef.current.set(threadId, nextMessages);
                        if (currentUserId) {
                            writeSessionCache(buildDmThreadCacheKey(currentUserId, threadId), nextMessages);
                        }

                        const payloadUser =
                            payload.user && typeof payload.user === "object"
                                ? (payload.user as ThreadUser)
                                : deriveThreadUserFromMessages(nextMessages, threadId);
                        if (payloadUser?.id) {
                            cacheThreadUser(payloadUser);
                        }
                    } catch {
                        // Ignore background warm-up failures.
                    }
                })
            );
        },
        [cacheThreadUser, currentUserId, deriveThreadUserFromMessages, fetchReadWithRetry]
    );

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

            setThreads((prev) => {
                const nextThreads = [nextThread, ...prev.filter((thread) => thread.id !== otherUser.id)];
                persistThreads(nextThreads);
                return nextThreads;
            });
            cacheThreadUser(otherUser);
            setSelectedUser((current) => current || otherUser);
        },
        [cacheThreadUser, currentUserId, persistThreads]
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
        if (!currentUserId || restoredThreadsRef.current) return;

        const cachedThreads = readSessionCache<Thread[]>(
            buildDmThreadsCacheKey(currentUserId),
            DM_THREADS_CACHE_TTL_MS
        );
        restoredThreadsRef.current = true;

        if (!cachedThreads || cachedThreads.length === 0) {
            return;
        }

        setThreads(cachedThreads);
        cachedThreads.forEach((thread) => cacheThreadUser(thread.user));
        if (!presetTarget) {
            setSelectedUserId((current) => current || cachedThreads[0]?.id || null);
        }
    }, [cacheThreadUser, currentUserId, presetTarget]);

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
        if (status !== "authenticated" || !session?.user) return;

        const hadThreads = threads.length > 0;
        setError("");
        if (!hadThreads) {
            setLoadingThreads(true);
        }
        try {
            const res = await fetchReadWithRetry("/api/direct-messages?mode=threads");
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError("DM一覧の読み込みに失敗しました。");
                return;
            }

            const nextThreads = Array.isArray(payload.threads) ? (payload.threads as Thread[]) : [];
            setThreads(nextThreads);
            persistThreads(nextThreads);
            nextThreads.forEach((thread) => cacheThreadUser(thread.user));
            void warmThreadCache(nextThreads.map((thread) => thread.id));

            if (presetTarget) {
                setSelectedUserId(presetTarget);
            } else if (nextThreads[0]) {
                setSelectedUserId((current) => current || nextThreads[0].id);
            }
        } catch {
            setError("DM一覧の読み込みに失敗しました。");
        } finally {
            setLoadingThreads(false);
        }
    }, [cacheThreadUser, fetchReadWithRetry, persistThreads, presetTarget, session?.user, status, threads.length, warmThreadCache]);

    useEffect(() => {
        if (status !== "authenticated" || !session?.user) return;
        void loadThreads();
    }, [loadThreads, session?.user, status]);

    useEffect(() => {
        if (!session?.user) return;
        markDmPrSeen();
    }, [session?.user]);

    useEffect(() => {
        if (!selectedUserId) {
            setSelectedUser(null);
            return;
        }

        const cachedUser =
            threads.find((thread) => thread.id === selectedUserId)?.user ||
            threadUserCacheRef.current.get(selectedUserId) ||
            null;
        if (cachedUser) {
            cacheThreadUser(cachedUser);
            setSelectedUser(cachedUser);
        }
    }, [cacheThreadUser, selectedUserId, threads]);

    useEffect(() => {
        if (!selectedUserId) {
            setMessages([]);
            setSelectedUser(null);
            return;
        }

        if (status !== "authenticated" || !session?.user) {
            return;
        }

        setThreadDrawerOpen(false);

        let active = true;
        if (!threadMessagesCacheRef.current.has(selectedUserId) && currentUserId) {
            const cachedThreadMessages = readSessionCache<DirectMessage[]>(
                buildDmThreadCacheKey(currentUserId, selectedUserId),
                DM_THREAD_CACHE_TTL_MS
            );
            if (cachedThreadMessages) {
                threadMessagesCacheRef.current.set(selectedUserId, cachedThreadMessages);
            }
        }
        const cachedMessages = threadMessagesCacheRef.current.get(selectedUserId) || [];
        if (cachedMessages.length > 0) {
            setMessages(cachedMessages);
            setLoadingMessages(false);
        } else {
            setMessages([]);
            setLoadingMessages(true);
        }
        setError("");

        fetchReadWithRetry(
            `/api/direct-messages?mode=thread&userId=${encodeURIComponent(selectedUserId)}`,
            cachedMessages.length > 0 ? 1 : 2
        )
            .then(async (threadRes) => {
                const threadPayload = await threadRes.json().catch(() => ({}));
                if (!threadRes.ok) {
                    throw new Error("DMの読み込みに失敗しました。");
                }

                if (!active) return;
                const nextMessages = Array.isArray(threadPayload.messages)
                    ? (threadPayload.messages as DirectMessage[])
                    : [];
                replaceMessagesForThread(selectedUserId, nextMessages);

                const payloadUser =
                    threadPayload.user && typeof threadPayload.user === "object"
                        ? (threadPayload.user as ThreadUser)
                        : deriveThreadUserFromMessages(nextMessages, selectedUserId);
                if (payloadUser?.id) {
                    cacheThreadUser(payloadUser);
                    setSelectedUser(payloadUser);
                }
            })
            .catch((err: unknown) => {
                if (!active) return;
                if (cachedMessages.length === 0) {
                    setMessages([]);
                }
                setError(err instanceof Error ? err.message : "DMの読み込みに失敗しました。");
            })
            .finally(() => {
                if (active) setLoadingMessages(false);
            });

        return () => {
            active = false;
        };
    }, [cacheThreadUser, currentUserId, deriveThreadUserFromMessages, fetchReadWithRetry, replaceMessagesForThread, selectedUserId, session?.user, status]);

    useEffect(() => {
        if (!selectedUserId || messages.length === 0) return;
        requestAnimationFrame(() => {
            scrollMessagesToBottom();
        });
    }, [messages.length, scrollMessagesToBottom, selectedUserId]);

    const refreshCurrentThread = useCallback(async () => {
        if (!selectedUserId) return;
        try {
            const res = await fetchReadWithRetry(`/api/direct-messages?mode=thread&userId=${encodeURIComponent(selectedUserId)}`);
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) return;
            const nextMessages = Array.isArray(payload.messages) ? (payload.messages as DirectMessage[]) : [];
            replaceMessagesForThread(selectedUserId, nextMessages);
            const payloadUser =
                payload.user && typeof payload.user === "object"
                    ? (payload.user as ThreadUser)
                    : deriveThreadUserFromMessages(nextMessages, selectedUserId);
            if (payloadUser?.id) {
                cacheThreadUser(payloadUser);
                setSelectedUser(payloadUser);
            }
        } catch {
            // ignore silent refresh failures
        }
    }, [cacheThreadUser, deriveThreadUserFromMessages, fetchReadWithRetry, replaceMessagesForThread, selectedUserId]);

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
        updateCurrentThreadMessages((prev) => [...prev, optimisticMessage]);
        syncThreadFromMessage(optimisticMessage);
        requestAnimationFrame(() => {
            scrollMessagesToBottom("smooth");
        });

        try {
            const res = await fetch("/api/direct-messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipientId: selectedUserId, content }),
                credentials: "same-origin",
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                updateCurrentThreadMessages((prev) => prev.filter((message) => message.id !== optimisticId));
                setDraft((prev) => (prev ? prev : content));
                setError(payload.error || "メッセージの送信に失敗しました。");
                return;
            }

            if (payload && typeof payload === "object" && typeof payload.id === "string") {
                const nextMessage = payload as DirectMessage;
                updateCurrentThreadMessages((prev) =>
                    prev.map((message) => (message.id === optimisticId ? nextMessage : message))
                );
                syncThreadFromMessage(nextMessage);
            } else {
                updateCurrentThreadMessages((prev) => prev.filter((message) => message.id !== optimisticId));
                await refreshCurrentThread();
            }

            markDmPrSeen();
        } catch {
            updateCurrentThreadMessages((prev) => prev.filter((message) => message.id !== optimisticId));
            setDraft((prev) => (prev ? prev : content));
            setError("メッセージの送信に失敗しました。");
        }
    };

    const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
        if (event.ctrlKey) return;

        event.preventDefault();
        if (!selectedUserId || !draft.trim()) return;

        void sendMessage();
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
                credentials: "same-origin",
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
                credentials: "same-origin",
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

    const toggleSelectId = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const bulkDelete = async () => {
        const ids = [...selectedIds].filter((id) => !id.startsWith("temp-"));
        if (ids.length === 0) return;
        if (!confirm(`${ids.length}件のメッセージを削除しますか？`)) return;

        setBulkDeleting(true);
        setError("");
        try {
            await Promise.all(
                ids.map((id) =>
                    fetch(`/api/direct-messages/${encodeURIComponent(id)}`, {
                        method: "DELETE",
                        credentials: "same-origin",
                    })
                )
            );
            setMessages((prev) => prev.filter((m) => !selectedIds.has(m.id)));
            setSelectedIds(new Set());
            setSelectMode(false);
            await refreshCurrentThread();
            void loadThreads();
        } catch {
            setError("一部のメッセージの削除に失敗しました。");
        } finally {
            setBulkDeleting(false);
        }
    };

    const exitSelectMode = () => {
        setSelectMode(false);
        setSelectedIds(new Set());
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

    const handleBack = () => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
        } else {
            router.push("/");
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
            <nav className="navbar" style={{ justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>
                        <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                        Next Blog <span className="beta-badge">β</span>
                    </Link>
                </div>
                <div className="nav-auth" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Link href="/settings" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                        ⚙
                    </Link>
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
            </nav>

            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "78px 16px 12px", maxWidth: 960, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 400, margin: "0 0 10px", flexShrink: 0 }}>DM</h1>

                {error && <div className="login-message login-error" style={{ marginBottom: 8, flexShrink: 0 }}>{error}</div>}

                <section
                    style={{
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                        background: "var(--card)",
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                        overflow: "hidden",
                        minHeight: 0,
                    }}
                >
                    {/* Header bar */}
                    <div
                        style={{
                            padding: "10px 14px",
                            borderBottom: "1px solid var(--border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            flexShrink: 0,
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
                            {selectedUser?.id ? (
                                <Link
                                    href={selectedUser.userId ? `/user/${encodeURIComponent(selectedUser.userId)}` : "#"}
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
                        {/* Select mode toggle */}
                        {selectedUserId && messages.some((m) => m.senderId === currentUserId && !m.pending) ? (
                            <button
                                type="button"
                                className="editor-btn editor-btn-secondary"
                                style={{ padding: "4px 10px", fontSize: 11, flexShrink: 0 }}
                                onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                            >
                                {selectMode ? "キャンセル" : "選択"}
                            </button>
                        ) : null}
                    </div>

                    {/* Bulk delete bar */}
                    {selectMode && selectedIds.size > 0 ? (
                        <div style={{ padding: "6px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, background: "rgba(155,107,107,0.06)" }}>
                            <span style={{ fontSize: 12, color: "var(--text-soft)" }}>{selectedIds.size}件選択中</span>
                            <button
                                type="button"
                                className="editor-btn editor-btn-danger"
                                style={{ padding: "4px 12px", fontSize: 11 }}
                                disabled={bulkDeleting}
                                onClick={() => void bulkDelete()}
                            >
                                {bulkDeleting ? "削除中..." : "まとめて削除"}
                            </button>
                        </div>
                    ) : null}

                    {/* Chat messages — scrollable area */}
                    <div ref={messageListRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
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
                                const isSelected = selectedIds.has(message.id);

                                return (
                                    <div
                                        key={message.id}
                                        style={{
                                            alignSelf: mine ? "flex-end" : "flex-start",
                                            maxWidth: "min(78%, 640px)",
                                            display: "flex",
                                            alignItems: "flex-start",
                                            gap: 6,
                                        }}
                                    >
                                        {selectMode && mine && !isPending ? (
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelectId(message.id)}
                                                style={{ marginTop: 12, accentColor: "var(--azuki)", flexShrink: 0 }}
                                            />
                                        ) : null}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div
                                                style={{
                                                    border: "1px solid var(--border)",
                                                    background: mine
                                                        ? isSelected ? "rgba(155,107,107,0.18)" : "rgba(155,107,107,0.08)"
                                                        : "var(--bg-card)",
                                                    borderRadius: 12,
                                                    padding: "10px 12px",
                                                    fontSize: 13,
                                                    lineHeight: 1.65,
                                                    whiteSpace: "pre-wrap",
                                                    opacity: isPending ? 0.88 : 1,
                                                    transition: "background 0.15s",
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
                                                {mine && !isPending && !selectMode ? (
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
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Input area with inline send button */}
                    <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px", flexShrink: 0 }}>
                        <div style={{ position: "relative" }}>
                            <textarea
                                className="login-input"
                                rows={2}
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                onKeyDown={handleDraftKeyDown}
                                placeholder={selectedUserId ? "メッセージを入力..." : "会話相手を選択してください"}
                                disabled={!selectedUserId}
                                style={{ paddingRight: 64, resize: "none", fontFamily: "var(--sans)", marginBottom: 0 }}
                            />
                            <button
                                type="button"
                                className="editor-btn editor-btn-primary"
                                disabled={!selectedUserId || !draft.trim()}
                                onClick={sendMessage}
                                style={{
                                    position: "absolute",
                                    right: 8,
                                    bottom: 8,
                                    padding: "5px 14px",
                                    fontSize: 12,
                                    borderRadius: 8,
                                }}
                            >
                                送信
                            </button>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-soft)", marginTop: 4, textAlign: "right" }}>{draft.length}/10000</div>
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
        </div>
    );
}
