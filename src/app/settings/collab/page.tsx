"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

export default function CollaborationSettingsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

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
            setMessage("Failed to load collaboration data");
        } finally {
            setLoadingData(false);
        }
    }, [session?.user]);

    useEffect(() => {
        if (session?.user) {
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
                setMessage(payload.error || "Failed to save DM setting");
                return;
            }

            setMessage("DM setting saved");
        } catch {
            setMessage("Failed to save DM setting");
        } finally {
            setSaving(false);
        }
    };

    if (status === "loading") {
        return (
            <div className="login-container">
                <div className="login-card" style={{ textAlign: "center" }}>
                    <p style={{ color: "var(--text-soft)" }}>Loading...</p>
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
                    Next Blog <span className="beta-badge">{"\uFF8E\uFF72"}</span>
                </Link>
                <div className="nav-auth">
                    <Link href="/settings" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                        Back to settings
                    </Link>
                </div>
            </nav>

            <div className="editor-container" style={{ maxWidth: 860 }}>
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 400, marginBottom: 18 }}>
                    Collaboration Settings
                </h1>

                {message && (
                    <div className={`login-message ${message.toLowerCase().includes("failed") ? "login-error" : ""}`} style={{ marginBottom: 18 }}>
                        {message}
                    </div>
                )}

                <section style={{ marginBottom: 32 }}>
                    <h2 className="settings-section-title">DM Permission</h2>
                    <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 12 }}>
                        Control who can DM you and who can send article pull requests.
                    </p>

                    <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)" }}>
                            <input type="radio" name="dmSetting" checked={dmSetting === "OPEN"} onChange={() => setDmSetting("OPEN")} />
                            <span>
                                <strong>Open (default)</strong>
                                <span style={{ display: "block", fontSize: 12, color: "var(--text-soft)" }}>
                                    Anyone can send DM and article pull requests.
                                </span>
                            </span>
                        </label>

                        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)" }}>
                            <input type="radio" name="dmSetting" checked={dmSetting === "PR_ONLY"} onChange={() => setDmSetting("PR_ONLY")} />
                            <span>
                                <strong>Pull request only</strong>
                                <span style={{ display: "block", fontSize: 12, color: "var(--text-soft)" }}>
                                    DM is only allowed when attached to an article pull request.
                                </span>
                            </span>
                        </label>

                        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)" }}>
                            <input type="radio" name="dmSetting" checked={dmSetting === "CLOSED"} onChange={() => setDmSetting("CLOSED")} />
                            <span>
                                <strong>Closed</strong>
                                <span style={{ display: "block", fontSize: 12, color: "var(--text-soft)" }}>
                                    Neither DM nor article pull requests are accepted.
                                </span>
                            </span>
                        </label>
                    </div>

                    <button type="button" className="editor-btn editor-btn-primary" onClick={saveDmSetting} disabled={saving}>
                        {saving ? "Saving..." : "Save DM setting"}
                    </button>
                </section>

                <section style={{ marginBottom: 32 }}>
                    <h2 className="settings-section-title">Incoming Article Pull Requests</h2>
                    {loadingData ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>Loading...</p>
                    ) : receivedPullRequests.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>No incoming pull requests yet.</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {receivedPullRequests.map((pr) => (
                                <article key={pr.id} style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", padding: 14 }}>
                                    <h3 style={{ fontSize: 16, marginBottom: 6 }}>{pr.title}</h3>
                                    <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>
                                        from {pr.proposer?.name || pr.proposer?.email || "Unknown"} ﾂｷ {new Date(pr.createdAt).toLocaleString("ja-JP")}
                                    </p>
                                    {pr.excerpt && <p style={{ fontSize: 13, marginBottom: 8 }}>{pr.excerpt}</p>}
                                    {pr.messages && pr.messages[0] && (
                                        <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>
                                            DM: {pr.messages[0].content}
                                        </p>
                                    )}
                                    <details>
                                        <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--azuki)" }}>View article content</summary>
                                        <div style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.7 }}>{pr.content}</div>
                                    </details>
                                </article>
                            ))}
                        </div>
                    )}
                </section>

                <section style={{ marginBottom: 32 }}>
                    <h2 className="settings-section-title">Incoming Direct Messages</h2>
                    {loadingData ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>Loading...</p>
                    ) : inboxMessages.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>No direct messages yet.</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {inboxMessages.map((dm) => (
                                <article key={dm.id} style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", padding: 14 }}>
                                    <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>
                                        from {dm.sender?.name || dm.sender?.email || "Unknown"} ﾂｷ {new Date(dm.createdAt).toLocaleString("ja-JP")}
                                    </p>
                                    <p style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7 }}>{dm.content}</p>
                                </article>
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <h2 className="settings-section-title">Sent Article Pull Requests</h2>
                    {loadingData ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>Loading...</p>
                    ) : sentPullRequests.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--text-soft)" }}>No sent pull requests yet.</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {sentPullRequests.map((pr) => (
                                <article key={pr.id} style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", padding: 14 }}>
                                    <h3 style={{ fontSize: 16, marginBottom: 6 }}>{pr.title}</h3>
                                    <p style={{ fontSize: 12, color: "var(--text-soft)" }}>
                                        to {pr.recipient?.name || pr.recipient?.email || "Unknown"} ﾂｷ {new Date(pr.createdAt).toLocaleString("ja-JP")}
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
