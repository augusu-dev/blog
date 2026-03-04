"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";

interface UserCollaborationPanelProps {
    recipientId: string;
    recipientName: string;
    dmSetting: DmSetting;
    isSignedIn: boolean;
}

const DM_LIMIT = 1000;

function parseTags(input: string): string[] {
    const unique = new Set<string>();
    input
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .forEach((tag) => unique.add(tag));
    return Array.from(unique).slice(0, 20);
}

export default function UserCollaborationPanel({
    recipientId,
    recipientName,
    dmSetting,
    isSignedIn,
}: UserCollaborationPanelProps) {
    const [prTitle, setPrTitle] = useState("");
    const [prExcerpt, setPrExcerpt] = useState("");
    const [prContent, setPrContent] = useState("");
    const [prTagsText, setPrTagsText] = useState("");
    const [prDmMessage, setPrDmMessage] = useState("");
    const [prSubmitting, setPrSubmitting] = useState(false);
    const [prStatus, setPrStatus] = useState("");

    const [dmContent, setDmContent] = useState("");
    const [dmSubmitting, setDmSubmitting] = useState(false);
    const [dmStatus, setDmStatus] = useState("");

    const canCreatePullRequest = dmSetting !== "CLOSED";
    const canSendGeneralDm = dmSetting === "OPEN";

    const dmSettingLabel = useMemo(() => {
        if (dmSetting === "PR_ONLY") {
            return "Direct message: only allowed when sending a pull request.";
        }
        if (dmSetting === "CLOSED") {
            return "Direct message and pull request are both closed.";
        }
        return "Direct message: open to everyone.";
    }, [dmSetting]);

    const submitPullRequest = async () => {
        setPrStatus("");

        const title = prTitle.trim();
        const content = prContent.trim();
        const excerpt = prExcerpt.trim();
        const dmMessage = prDmMessage.trim();

        if (!title || !content) {
            setPrStatus("Title and full article content are required.");
            return;
        }

        if (dmMessage.length > DM_LIMIT) {
            setPrStatus("DM message must be 1000 chars or fewer.");
            return;
        }

        setPrSubmitting(true);
        try {
            const res = await fetch("/api/pull-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recipientId,
                    title,
                    excerpt,
                    content,
                    tags: parseTags(prTagsText),
                    dmMessage,
                }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setPrStatus(payload.error || "Failed to send pull request");
                return;
            }

            setPrStatus("Pull request proposal sent.");
            setPrTitle("");
            setPrExcerpt("");
            setPrContent("");
            setPrTagsText("");
            setPrDmMessage("");
        } catch {
            setPrStatus("Failed to send pull request");
        } finally {
            setPrSubmitting(false);
        }
    };

    const submitDirectMessage = async () => {
        setDmStatus("");
        const content = dmContent.trim();

        if (!content) {
            setDmStatus("Message is required.");
            return;
        }

        if (content.length > DM_LIMIT) {
            setDmStatus("Message must be 1000 chars or fewer.");
            return;
        }

        setDmSubmitting(true);
        try {
            const res = await fetch("/api/direct-messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipientId, content }),
            });

            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                setDmStatus(payload.error || "Failed to send direct message");
                return;
            }

            setDmStatus("Direct message sent.");
            setDmContent("");
        } catch {
            setDmStatus("Failed to send direct message");
        } finally {
            setDmSubmitting(false);
        }
    };

    return (
        <section style={{ marginTop: 36 }}>
            <h2 className="section-title" style={{ marginBottom: 8 }}>Collaboration</h2>
            <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
                {dmSettingLabel}
            </p>

            {!isSignedIn ? (
                <p style={{ fontSize: 13, color: "var(--text-soft)" }}>
                    Please <Link href="/login" style={{ color: "var(--azuki)", textDecoration: "none" }}>log in</Link> to send a pull request or direct message.
                </p>
            ) : (
                <>
                    {!canCreatePullRequest ? (
                        <div className="login-message" style={{ marginBottom: 16 }}>
                            This user does not accept pull requests right now.
                        </div>
                    ) : (
                        <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 18, background: "var(--card)", marginBottom: 18 }}>
                            <h3 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 400, marginBottom: 10 }}>
                                Propose a Finished Article
                            </h3>
                            <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 12 }}>
                                Send a complete article proposal to {recipientName}.
                            </p>

                            <input
                                type="text"
                                className="login-input"
                                placeholder="Article title"
                                value={prTitle}
                                onChange={(e) => setPrTitle(e.target.value)}
                                style={{ marginBottom: 10 }}
                            />
                            <input
                                type="text"
                                className="login-input"
                                placeholder="Short excerpt (optional)"
                                value={prExcerpt}
                                onChange={(e) => setPrExcerpt(e.target.value)}
                                style={{ marginBottom: 10 }}
                            />
                            <input
                                type="text"
                                className="login-input"
                                placeholder="Tags (comma separated, optional)"
                                value={prTagsText}
                                onChange={(e) => setPrTagsText(e.target.value)}
                                style={{ marginBottom: 10 }}
                            />
                            <textarea
                                className="login-input"
                                placeholder="Finished article content"
                                value={prContent}
                                onChange={(e) => setPrContent(e.target.value)}
                                rows={8}
                                style={{ marginBottom: 10, resize: "vertical", fontFamily: "var(--sans)" }}
                            />
                            <textarea
                                className="login-input"
                                placeholder={dmSetting === "PR_ONLY" ? "Message for this pull request (optional)" : "Attach a DM to this pull request (optional)"}
                                value={prDmMessage}
                                maxLength={DM_LIMIT}
                                onChange={(e) => setPrDmMessage(e.target.value)}
                                rows={3}
                                style={{ marginBottom: 8, resize: "vertical", fontFamily: "var(--sans)" }}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "var(--text-soft)" }}>
                                    PR DM {prDmMessage.length}/{DM_LIMIT}
                                </span>
                                <button
                                    type="button"
                                    className="editor-btn editor-btn-primary"
                                    disabled={prSubmitting || !prTitle.trim() || !prContent.trim()}
                                    onClick={submitPullRequest}
                                >
                                    {prSubmitting ? "Sending..." : "Send pull request"}
                                </button>
                            </div>
                            {prStatus && (
                                <p style={{ marginTop: 10, fontSize: 12, color: prStatus.includes("sent") ? "#4f7f52" : "#8b3535" }}>
                                    {prStatus}
                                </p>
                            )}
                        </div>
                    )}

                    {canSendGeneralDm ? (
                        <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 18, background: "var(--card)" }}>
                            <h3 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 400, marginBottom: 10 }}>Direct Message</h3>
                            <textarea
                                className="login-input"
                                value={dmContent}
                                maxLength={DM_LIMIT}
                                onChange={(e) => setDmContent(e.target.value)}
                                placeholder={`Send a direct message to ${recipientName}`}
                                rows={4}
                                style={{ marginBottom: 8, resize: "vertical", fontFamily: "var(--sans)" }}
                            />
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "var(--text-soft)" }}>
                                    {dmContent.length}/{DM_LIMIT}
                                </span>
                                <button
                                    type="button"
                                    className="editor-btn editor-btn-secondary"
                                    disabled={dmSubmitting || !dmContent.trim()}
                                    onClick={submitDirectMessage}
                                >
                                    {dmSubmitting ? "Sending..." : "Send DM"}
                                </button>
                            </div>
                            {dmStatus && (
                                <p style={{ marginTop: 10, fontSize: 12, color: dmStatus.includes("sent") ? "#4f7f52" : "#8b3535" }}>
                                    {dmStatus}
                                </p>
                            )}
                        </div>
                    ) : (
                        <p style={{ fontSize: 12, color: "var(--text-soft)" }}>
                            General DM is unavailable with this user setting.
                        </p>
                    )}
                </>
            )}
        </section>
    );
}
