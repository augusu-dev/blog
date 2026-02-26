"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const router = useRouter();
    const [isSignup, setIsSignup] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;

        setLoading(true);
        setError("");

        try {
            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError("メールアドレスまたはパスワードが間違っています。");
            } else {
                router.push("/editor");
            }
        } catch {
            setError("ログインに失敗しました。");
        } finally {
            setLoading(false);
        }
    };

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;

        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "アカウント作成に失敗しました。");
                return;
            }

            // サインアップ後に自動ログイン
            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError("アカウントは作成されましたが、ログインに失敗しました。ログインし直してください。");
                setIsSignup(false);
            } else {
                router.push("/editor");
            }
        } catch {
            setError("エラーが発生しました。");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <h1 className="login-title">{isSignup ? "サインアップ" : "ログイン"}</h1>
                <p className="login-desc">
                    {isSignup
                        ? "アカウントを作成して記事を書きましょう。"
                        : "メールアドレスとパスワードでログイン。"}
                </p>

                {error && (
                    <div className="login-message login-error">{error}</div>
                )}

                <form onSubmit={isSignup ? handleSignup : handleLogin}>
                    {isSignup && (
                        <input
                            type="text"
                            className="login-input"
                            placeholder="ユーザー名（任意）"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={loading}
                            style={{ marginBottom: 12 }}
                        />
                    )}
                    <input
                        type="email"
                        className="login-input"
                        placeholder="メールアドレス"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoFocus
                        disabled={loading}
                        style={{ marginBottom: 12 }}
                    />
                    <input
                        type="password"
                        className="login-input"
                        placeholder={isSignup ? "パスワード（6文字以上）" : "パスワード"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={isSignup ? 6 : undefined}
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        className="login-submit"
                        disabled={loading || !email || !password}
                    >
                        {loading
                            ? "処理中..."
                            : isSignup
                                ? "アカウントを作成"
                                : "ログイン"}
                    </button>
                </form>

                <button
                    onClick={() => { setIsSignup(!isSignup); setError(""); }}
                    style={{
                        display: "block",
                        width: "100%",
                        textAlign: "center",
                        marginTop: 16,
                        fontSize: 13,
                        color: "var(--azuki)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "var(--sans)",
                    }}
                >
                    {isSignup
                        ? "すでにアカウントをお持ちの方はこちら"
                        : "アカウントをお持ちでない方はこちら"}
                </button>

                <Link href="/" className="login-back">
                    ← ブログに戻る
                </Link>
            </div>
        </div>
    );
}
