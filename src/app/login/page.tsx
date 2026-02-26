"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setLoading(true);
        setError("");

        try {
            const result = await signIn("resend", {
                email,
                redirect: false,
                callbackUrl: "/editor",
            });

            if (result?.error) {
                setError("メールの送信に失敗しました。もう一度お試しください。");
            } else {
                setSent(true);
            }
        } catch {
            setError("エラーが発生しました。もう一度お試しください。");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <h1 className="login-title">ログイン</h1>

                {sent ? (
                    <>
                        <div className="login-message">
                            <strong>✉️ メールを送信しました</strong><br />
                            <span style={{ fontSize: 13 }}>
                                {email} にログインリンクを送信しました。<br />
                                メールを確認して、リンクをクリックしてください。
                            </span>
                        </div>
                        <button
                            className="login-submit"
                            style={{ background: "var(--bg-soft)", color: "var(--text)" }}
                            onClick={() => { setSent(false); setEmail(""); }}
                        >
                            別のメールアドレスで試す
                        </button>
                    </>
                ) : (
                    <>
                        <p className="login-desc">
                            メールアドレスを入力してください。<br />
                            ログインリンクが届きます。
                        </p>

                        {error && (
                            <div className="login-message login-error">{error}</div>
                        )}

                        <form onSubmit={handleSubmit}>
                            <input
                                type="email"
                                className="login-input"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoFocus
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                className="login-submit"
                                disabled={loading || !email}
                            >
                                {loading ? "送信中..." : "ログインリンクを送信"}
                            </button>
                        </form>
                    </>
                )}

                <Link href="/" className="login-back">
                    ← ブログに戻る
                </Link>
            </div>
        </div>
    );
}
