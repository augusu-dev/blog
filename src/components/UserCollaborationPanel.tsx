"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DmSetting = "OPEN" | "PR_ONLY" | "CLOSED";

interface UserCollaborationPanelProps {
    recipientId: string;
    recipientName: string;
    dmSetting: DmSetting;
    isSignedIn: boolean;
}

const DM_LIMIT = 10000;

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

    const canCreatePullRequest = dmSetting !== "CLOSED";

    useEffect(() => {
        if (dmSetting === "PR_ONLY" && prDmMessage) {
            setPrDmMessage("");
        }
    }, [dmSetting, prDmMessage]);

    const dmSettingLabel = useMemo(() => {
        if (dmSetting === "PR_ONLY") {
            return "DMは記事依頼に添付するメッセージとしてのみ送信できます。";
        }
        if (dmSetting === "CLOSED") {
            return "DMと記事依頼はどちらも受け付けていません。";
        }
        return "記事依頼（DM付き）を受け付けています。";
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
            setPrStatus("DMメッセージは10000文字以内で入力してください。");
            return;
        }

        if (dmSetting === "PR_ONLY" && dmMessage) {
            setPrStatus("PR_ONLY の相手には任意メッセージを添付できません。");
            return;
        }

        setPrSubmitting(true);
        try {
            const res = await fetch("/api/pull-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    kind: "SUBMISSION",
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

            setPrStatus("依頼を送信しました。");
            setPrTitle("");
            setPrExcerpt("");
            setPrContent("");
            setPrTagsText("");
            setPrDmMessage("");
        } catch {
            setPrStatus("依頼の送信に失敗しました。");
        } finally {
            setPrSubmitting(false);
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
                    <Link href="/login" style={{ color: "var(--azuki)", textDecoration: "none" }}>ログイン</Link>すると記事依頼を送信できます。
                </p>
            ) : (
                <>
                    {!canCreatePullRequest ? (
                        <div className="login-message" style={{ marginBottom: 16 }}>
                            このユーザーは現在、依頼を受け付けていません。
                        </div>
                    ) : (
                        <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 18, background: "var(--card)", marginBottom: 18 }}>
                            <h3 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 400, marginBottom: 10 }}>
                                記事を依頼する
                            </h3>
                            <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 12 }}>
                                {recipientName} に完成記事を提案できます。
                            </p>

                            <input
                                type="text"
                                className="login-input"
                                placeholder="記事タイトル"
                                value={prTitle}
                                onChange={(e) => setPrTitle(e.target.value)}
                                style={{ marginBottom: 10 }}
                            />
                            <input
                                type="text"
                                className="login-input"
                                placeholder="概要（任意）"
                                value={prExcerpt}
                                onChange={(e) => setPrExcerpt(e.target.value)}
                                style={{ marginBottom: 10 }}
                            />
                            <input
                                type="text"
                                className="login-input"
                                placeholder="タグ（カンマ区切り・任意）"
                                value={prTagsText}
                                onChange={(e) => setPrTagsText(e.target.value)}
                                style={{ marginBottom: 10 }}
                            />
                            <textarea
                                className="login-input"
                                placeholder="記事本文"
                                value={prContent}
                                onChange={(e) => setPrContent(e.target.value)}
                                rows={8}
                                style={{ marginBottom: 10, resize: "vertical", fontFamily: "var(--sans)" }}
                            />
                            <textarea
                                className="login-input"
                                placeholder="依頼メッセージ（任意）"
                                value={prDmMessage}
                                maxLength={DM_LIMIT}
                                onChange={(e) => setPrDmMessage(e.target.value)}
                                rows={3}
                                disabled={dmSetting === "PR_ONLY"}
                                style={{ marginBottom: 8, resize: "vertical", fontFamily: "var(--sans)" }}
                            />
                            {dmSetting === "PR_ONLY" ? (
                                <p style={{ marginTop: -2, marginBottom: 10, fontSize: 11, color: "var(--text-soft)" }}>
                                    PR_ONLY 設定の相手には任意メッセージを添付できません。
                                </p>
                            ) : null}
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
                                    {prSubmitting ? "送信中..." : "依頼を送信"}
                                </button>
                            </div>
                            {prStatus && (
                                <p style={{ marginTop: 10, fontSize: 12, color: prStatus.includes("送信") ? "#4f7f52" : "#8b3535" }}>
                                    {prStatus}
                                </p>
                            )}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
