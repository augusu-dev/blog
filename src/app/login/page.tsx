"use client";

import { useCallback, useEffect, useState } from "react";
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

    const buildMyPageHref = (rawPublicUserId?: string | null, rawUserId?: string | null) => {
        const publicUserId = typeof rawPublicUserId === "string" ? rawPublicUserId.trim() : "";
        if (publicUserId) {
            return `/user/${encodeURIComponent(publicUserId)}`;
        }
        const userId = typeof rawUserId === "string" ? rawUserId.trim() : "";
        return userId ? `/user/${encodeURIComponent(userId)}` : "/settings";
    };

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const resolveMyPageHref = useCallback(async (expectedEmail?: string) => {
        const sessionUser = session?.user as { id?: string | null; userId?: string | null; email?: string | null } | undefined;
        const normalizedExpectedEmail =
            typeof expectedEmail === "string" ? expectedEmail.trim().toLowerCase() : "";
        const normalizedSessionEmail =
            typeof sessionUser?.email === "string" ? sessionUser.email.trim().toLowerCase() : "";

        if (sessionUser?.userId && (!normalizedExpectedEmail || normalizedSessionEmail === normalizedExpectedEmail)) {
            return buildMyPageHref(sessionUser.userId, sessionUser.id);
        }

        for (let attempt = 0; attempt < 6; attempt += 1) {
            try {
                const res = await fetch("/api/auth/session", { cache: "no-store" });
                if (res.ok) {
                    const payload = (await res.json()) as {
                        user?: { id?: string | null; userId?: string | null; email?: string | null };
                    };
                    const resolvedEmail =
                        typeof payload.user?.email === "string"
                            ? payload.user.email.trim().toLowerCase()
                            : "";
                    if (!normalizedExpectedEmail || resolvedEmail === normalizedExpectedEmail) {
                        return buildMyPageHref(payload.user?.userId, payload.user?.id);
                    }
                }
            } catch {
                // retry until the auth cookie becomes visible to the session endpoint
            }

            await wait(200 * (attempt + 1));
        }

        return "/settings";
    }, [session]);

    useEffect(() => {
        if (status !== "authenticated") return;
        void resolveMyPageHref().then((destination) => {
            router.replace(destination);
        });
    }, [resolveMyPageHref, router, status]);

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
                const destination = await resolveMyPageHref(email);
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
                const destination = await resolveMyPageHref(email);
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
