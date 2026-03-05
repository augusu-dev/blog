"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ProvidersResponse = Record<string, { id: string; name: string }>;

export default function LoginPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [isSignup, setIsSignup] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState("");
    const [googleEnabled, setGoogleEnabled] = useState(false);

    const buildMyPageHref = (rawPublicUserId?: string | null) => {
        const publicUserId = typeof rawPublicUserId === "string" ? rawPublicUserId.trim() : "";
        return publicUserId ? `/user/${encodeURIComponent(publicUserId)}` : "/settings";
    };

    const resolveMyPageHref = async () => {
        const sessionUser = session?.user as { userId?: string | null } | undefined;
        if (sessionUser?.userId) {
            return buildMyPageHref(sessionUser.userId);
        }
        try {
            const res = await fetch("/api/auth/session", { cache: "no-store" });
            if (res.ok) {
                const payload = (await res.json()) as { user?: { userId?: string | null } };
                return buildMyPageHref(payload.user?.userId);
            }
        } catch {
            // noop
        }
        return "/settings";
    };

    useEffect(() => {
        if (status !== "authenticated") return;
        const sessionUser = session?.user as { userId?: string | null } | undefined;
        router.replace(buildMyPageHref(sessionUser?.userId));
    }, [router, session, status]);

    useEffect(() => {
        let active = true;

        fetch("/api/auth/providers")
            .then(async (res) => {
                if (!res.ok) return null;
                return (await res.json()) as ProvidersResponse;
            })
            .then((providers) => {
                if (!active) return;
                setGoogleEnabled(!!providers?.google);
            })
            .catch(() => {
                if (!active) return;
                setGoogleEnabled(false);
            });

        return () => {
            active = false;
        };
    }, []);

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
                const destination = await resolveMyPageHref();
                router.push(destination);
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

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.error || "アカウント作成に失敗しました。");
                return;
            }

            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError("アカウントは作成されましたが、ログインに失敗しました。ログインし直してください。");
                setIsSignup(false);
            } else {
                const destination = await resolveMyPageHref();
                router.push(destination);
            }
        } catch {
            setError("エラーが発生しました。");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleAuth = async () => {
        setGoogleLoading(true);
        setError("");
        try {
            await signIn("google", { callbackUrl: "/login" });
        } catch {
            setError("Google認証に失敗しました。");
            setGoogleLoading(false);
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

                {error && <div className="login-message login-error">{error}</div>}

                <form onSubmit={isSignup ? handleSignup : handleLogin}>
                    {isSignup && (
                        <>
                            <input
                                type="text"
                                className="login-input"
                                placeholder="ユーザー名（任意）"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={loading || googleLoading}
                                style={{ marginBottom: 12 }}
                            />
                            <p style={{ fontSize: 11, color: "var(--text-soft)", margin: "0 0 10px", lineHeight: 1.5 }}>
                                メールアドレスは
                                <a
                                    href="https://sute.jp"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "var(--azuki)", textDecoration: "none", margin: "0 4px" }}
                                >
                                    sute.jp
                                </a>
                                でも使用できます。
                            </p>
                        </>
                    )}

                    <input
                        type="email"
                        className="login-input"
                        placeholder="メールアドレス"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoFocus
                        disabled={loading || googleLoading}
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
                        disabled={loading || googleLoading}
                    />

                    <button
                        type="submit"
                        className="login-submit"
                        disabled={loading || googleLoading || !email || !password}
                    >
                        {loading ? "処理中..." : isSignup ? "アカウントを作成" : "ログイン"}
                    </button>
                </form>

                {googleEnabled && (
                    <button
                        type="button"
                        className="editor-btn editor-btn-secondary"
                        onClick={handleGoogleAuth}
                        disabled={loading || googleLoading}
                        style={{ width: "100%", marginTop: 10, padding: "10px 0" }}
                    >
                        {googleLoading
                            ? "Google認証中..."
                            : isSignup
                              ? "Googleでサインアップ"
                              : "Googleでログイン"}
                    </button>
                )}

                <button
                    onClick={() => {
                        setIsSignup(!isSignup);
                        setError("");
                    }}
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
