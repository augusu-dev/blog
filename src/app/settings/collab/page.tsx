"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { markDmPrSeen } from "@/lib/dmUnreadClient";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";

interface PullRequestItem {
    id: string;
    title: string;
    excerpt: string | null;
    content: string;
    tags: string[];
    createdAt: string;
    proposer?: { id: string; name: string | null; email: string | null };
    recipient?: { id: string; name: string | null; email: string | null };
    messages?: Array<{
        id: string;
        content: string;
        createdAt: string;
        sender: { id: string; name: string | null; email: string | null };
    }>;
}

interface DirectMessageItem {
    id: string;
    content: string;
    createdAt: string;
    sender?: { id: string; name: string | null; email: string | null };
    recipient?: { id: string; name: string | null; email: string | null };
}

type UiText = {
    back: string;
    title: string;
    saveSuccess: string;
    loadFailed: string;
    saveFailed: string;
    loading: string;
    dmTitle: string;
    dmDesc: string;
    openTitle: string;
    openDesc: string;
    prOnlyTitle: string;
    prOnlyDesc: string;
    closedTitle: string;
    closedDesc: string;
    saveButton: string;
    saving: string;
    incomingPrTitle: string;
    incomingPrEmpty: string;
    incomingDmTitle: string;
    incomingDmEmpty: string;
    sentPrTitle: string;
    sentPrEmpty: string;
    from: string;
    to: string;
    unknown: string;
    viewContent: string;
    dmPrefix: string;
};

const UI_TEXT: Record<"ja" | "en" | "zh", UiText> = {
    ja: {
        back: "設定へ戻る",
        title: "PR / DM 設定",
        saveSuccess: "DM設定を保存しました。",
        loadFailed: "PR/DMデータの読み込みに失敗しました。",
        saveFailed: "DM設定の保存に失敗しました。",
        loading: "読み込み中...",
        dmTitle: "DMの受け取り設定",
        dmDesc: "DMおよび記事プルリクエストの受け取り範囲を設定できます。",
        openTitle: "Open（デフォルト）",
        openDesc: "誰でもDM送信と記事プルリクエストが可能です。",
        prOnlyTitle: "プルリクエスト時のみ",
        prOnlyDesc: "通常DMは不可。記事プルリクエストに添付するDMのみ許可します。",
        closedTitle: "Closed",
        closedDesc: "DMも記事プルリクエストも受け付けません。",
        saveButton: "DM設定を保存",
        saving: "保存中...",
        incomingPrTitle: "受信した記事プルリクエスト",
        incomingPrEmpty: "受信した記事プルリクエストはまだありません。",
        incomingDmTitle: "受信したDM",
        incomingDmEmpty: "受信したDMはまだありません。",
        sentPrTitle: "送信した記事プルリクエスト",
        sentPrEmpty: "送信した記事プルリクエストはまだありません。",
        from: "from",
        to: "to",
        unknown: "不明",
        viewContent: "記事本文を表示",
        dmPrefix: "DM",
    },
    en: {
        back: "Back to settings",
        title: "PR / DM Settings",
        saveSuccess: "DM setting saved.",
        loadFailed: "Failed to load PR/DM data.",
        saveFailed: "Failed to save DM setting.",
        loading: "Loading...",
        dmTitle: "DM Permission",
        dmDesc: "Control who can DM you and who can send article pull requests.",
        openTitle: "Open (default)",
        openDesc: "Anyone can send DM and article pull requests.",
        prOnlyTitle: "Pull request only",
        prOnlyDesc: "DM is only allowed when attached to an article pull request.",
        closedTitle: "Closed",
        closedDesc: "Neither DM nor article pull requests are accepted.",
        saveButton: "Save DM setting",
        saving: "Saving...",
        incomingPrTitle: "Incoming Article Pull Requests",
        incomingPrEmpty: "No incoming pull requests yet.",
        incomingDmTitle: "Incoming Direct Messages",
        incomingDmEmpty: "No direct messages yet.",
        sentPrTitle: "Sent Article Pull Requests",
        sentPrEmpty: "No sent pull requests yet.",
        from: "from",
        to: "to",
        unknown: "Unknown",
        viewContent: "View article content",
        dmPrefix: "DM",
    },
    zh: {
        back: "返回设置",
        title: "PR / DM 设置",
        saveSuccess: "DM 设置已保存。",
        loadFailed: "加载 PR/DM 数据失败。",
        saveFailed: "保存 DM 设置失败。",
        loading: "加载中...",
        dmTitle: "DM 接收权限",
        dmDesc: "可以设置谁能给你发送 DM 以及谁能发送文章 PR 请求。",
        openTitle: "Open（默认）",
        openDesc: "任何人都可以发送 DM 和文章 PR 请求。",
        prOnlyTitle: "仅 PR 时开放",
        prOnlyDesc: "普通 DM 不可用，仅允许随文章 PR 请求附带 DM。",
        closedTitle: "Closed",
        closedDesc: "不接受 DM，也不接受文章 PR 请求。",
        saveButton: "保存 DM 设置",
        saving: "保存中...",
        incomingPrTitle: "收到的文章 PR 请求",
        incomingPrEmpty: "还没有收到文章 PR 请求。",
        incomingDmTitle: "收到的 DM",
        incomingDmEmpty: "还没有收到 DM。",
        sentPrTitle: "已发送的文章 PR 请求",
        sentPrEmpty: "还没有发送文章 PR 请求。",
        from: "来自",
        to: "发给",
        unknown: "未知",
        viewContent: "查看文章内容",
        dmPrefix: "DM",
    },
};

export default function CollaborationSettingsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { language } = useLanguage();

    const text = useMemo(() => UI_TEXT[language], [language]);

    const [dmSetting, setDmSetting] = useState<DmSetting>("OPEN");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    const [receivedPullRequests, setReceivedPullRequests] = useState<PullRequestItem[]>([]);
    const [sentPullRequests, setSentPullRequests] = useState<PullRequestItem[]>([]);
    const [inboxMessages, setInboxMessages] = useState<DirectMessageItem[]>([]);
    const [loadingData, setLoadingData] = useState(true);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    const loadData = useCallback(async () => {
        if (!session?.user) return;

        setLoadingData(true);
        try {
            const [settingsRes, pullRes, dmRes] = await Promise.all([
                fetch("/api/user/settings"),
                fetch("/api/pull-requests"),
                fetch("/api/direct-messages"),
            ]);

            if (settingsRes.ok) {
                const settings = await settingsRes.json();
                setDmSetting((settings.dmSetting as DmSetting) || "OPEN");
            }

            if (pullRes.ok) {
                const payload = await pullRes.json();
                setReceivedPullRequests(Array.isArray(payload.received) ? payload.received : []);
                setSentPullRequests(Array.isArray(payload.sent) ? payload.sent : []);
            }

            if (dmRes.ok) {
                const payload = await dmRes.json();
                setInboxMessages(Array.isArray(payload.messages) ? payload.messages : []);
            }
        } catch {
            setMessage(text.loadFailed);
        } finally {
            setLoadingData(false);
        }
    }, [session?.user, text.loadFailed]);

    useEffect(() => {
        if (session?.user) {
            markDmPrSeen();
            void loadData();
        }
    }, [session, loadData]);

    const saveDmSetting = async () => {
        setSaving(true);
        setMessage("");

        try {
            const res = await fetch("/api/user/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dmSetting }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMessage(payload.error || text.saveFailed);
                return;
            }

            setMessage(text.saveSuccess);
        } catch {
            setMessage(text.saveFailed);
        } finally {
            setSaving(false);
        }
    };

    if (status === "loading") {
        return (
            <div className="login-container">
                <div className="login-card" style={{ textAlign: "center" }}>
                    <p style={{ color: "var(--text-soft)" }}>{text.loading}</p>
                </div>
            </div>
        );
    }

    if (!session?.user) return null;

    return (
        <>
            <nav className="navbar" style={{ justifyContent: "space-between" }}>
                <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>
                    <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                    Next Blog <span className="beta-badge">β</span>
                </Link>
                <div className="nav-auth">
                    <Link href="/settings" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                        {text.back}
                    </Link>
                </div>
            </nav>

            <div className="editor-container" style={{ maxWidth: 860 }}>
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 400, marginBottom: 18 }}>
                    {text.title}
                </h1>

                {message && (
                    <div className={`login-message ${message.includes("失敗") || message.toLowerCase().includes("failed") ? "login-error" : ""}`} style={{ marginBottom: 18 }}>
                        {message}
                    </div>
                )}

                <section style={{ marginBottom: 32 }}>
                    <h2 className="settings-section-title">{text.dmTitle}</h2>
                    <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 12 }}>{text.dmDesc}</p>

                    <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)" }}>
                            <input type="radio" name="dmSetting" checked={dmSetting === "OPEN"} onChange={() => setDmSetting("OPEN")} />
                            <span>
                                <strong>{text.openTitle}</strong>
                                <span style={{ display: "block", fontSize: 12, color: "var(--text-soft)" }}>{text.openDesc}</span>
                            </span>
                        </label>

                        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)" }}>
                            <input type="radio" name="dmSetting" checked={dmSetting === "PR_ONLY"} onChange={() => setDmSetting("PR_ONLY")} />
                            <span>
                                <strong>{text.prOnlyTitle}</strong>
                                <span style={{ display: "block", fontSize: 12, color: "var(--text-soft)" }}>{text.prOnlyDesc}</span>
                            </span>
                        </label>

                        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)" }}>
                            <input type="radio" name="dmSetting" checked={dmSetting === "CLOSED"} onChange={() => setDmSetting("CLOSED")} />
                            <span>
                                <strong>{text.closedTitle}</strong>
                                <span style={{ display: "block", fontSize: 12, color: "var(--text-soft)" }}>{text.closedDesc}</span>
                            </span>
                        </label>
                    </div>

                    <button type="button" className="editor-btn editor-btn-primary" onClick={saveDmSetting} disabled={saving}>
                        {saving ? text.saving : text.saveButton}
                    </button>
                </section>

                <section id="incoming-dm" style={{ marginBottom: 32 }}>
                    <h2 className="settings-section-title">{text.incomingPrTitle}</h2>
                    {loadingData ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>{text.loading}</p>
                    ) : receivedPullRequests.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>{text.incomingPrEmpty}</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {receivedPullRequests.map((pr) => (
                                <article key={pr.id} style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", padding: 14 }}>
                                    <h3 style={{ fontSize: 16, marginBottom: 6 }}>{pr.title}</h3>
                                    <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>
                                        {text.from} {pr.proposer?.name || pr.proposer?.email || text.unknown} ・ {new Date(pr.createdAt).toLocaleString("ja-JP")}
                                    </p>
                                    {pr.excerpt && <p style={{ fontSize: 13, marginBottom: 8 }}>{pr.excerpt}</p>}
                                    {pr.messages && pr.messages[0] && (
                                        <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>
                                            {text.dmPrefix}: {pr.messages[0].content}
                                        </p>
                                    )}
                                    <details>
                                        <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--azuki)" }}>{text.viewContent}</summary>
                                        <div style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.7 }}>{pr.content}</div>
                                    </details>
                                </article>
                            ))}
                        </div>
                    )}
                </section>

                <section style={{ marginBottom: 32 }}>
                    <h2 className="settings-section-title">{text.incomingDmTitle}</h2>
                    {loadingData ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>{text.loading}</p>
                    ) : inboxMessages.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>{text.incomingDmEmpty}</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {inboxMessages.map((dm) => (
                                <article key={dm.id} style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", padding: 14 }}>
                                    <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>
                                        {text.from} {dm.sender?.name || dm.sender?.email || text.unknown} ・ {new Date(dm.createdAt).toLocaleString("ja-JP")}
                                    </p>
                                    <p style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7 }}>{dm.content}</p>
                                </article>
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <h2 className="settings-section-title">{text.sentPrTitle}</h2>
                    {loadingData ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>{text.loading}</p>
                    ) : sentPullRequests.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>{text.sentPrEmpty}</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {sentPullRequests.map((pr) => (
                                <article key={pr.id} style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", padding: 14 }}>
                                    <h3 style={{ fontSize: 16, marginBottom: 6 }}>{pr.title}</h3>
                                    <p style={{ fontSize: 12, color: "var(--text-soft)" }}>
                                        {text.to} {pr.recipient?.name || pr.recipient?.email || text.unknown} ・ {new Date(pr.createdAt).toLocaleString("ja-JP")}
                                    </p>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </>
    );
}
