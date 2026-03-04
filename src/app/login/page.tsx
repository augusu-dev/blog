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
                setError("Invalid email or password.");
            } else {
                router.push("/editor");
            }
        } catch {
            setError("Failed to log in.");
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
                setError(data.error || "Failed to create account.");
                return;
            }

            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError("Account created, but automatic login failed. Please log in.");
                setIsSignup(false);
            } else {
                router.push("/editor");
            }
        } catch {
            setError("Failed to create account.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <h1 className="login-title">{isSignup ? "Sign up" : "Log in"}</h1>
                <p className="login-desc">
                    {isSignup
                        ? "Create your account and start writing."
                        : "Log in with your email and password."}
                </p>

                {error && <div className="login-message login-error">{error}</div>}

                <form onSubmit={isSignup ? handleSignup : handleLogin}>
                    {isSignup && (
                        <input
                            type="text"
                            className="login-input"
                            placeholder="User name (optional)"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={loading}
                            style={{ marginBottom: 12 }}
                        />
                    )}

                    <input
                        type="email"
                        className="login-input"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoFocus
                        disabled={loading}
                        style={{ marginBottom: 12 }}
                    />

                    {isSignup && (
                        <p style={{ fontSize: 11, color: "var(--text-soft)", margin: "0 0 10px", lineHeight: 1.5 }}>
                            捨てメールアドレスは
                            <a
                                href="https://sute.jp"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "var(--azuki)", textDecoration: "none", margin: "0 4px" }}
                            >
                                sute.jp
                            </a>
                            も選択できます。
                        </p>
                    )}

                    <input
                        type="password"
                        className="login-input"
                        placeholder={isSignup ? "Password (min 6 chars)" : "Password"}
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
                        {loading ? "Working..." : isSignup ? "Create account" : "Log in"}
                    </button>
                </form>

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
                    {isSignup ? "Already have an account? Log in" : "No account yet? Sign up"}
                </button>

                <Link href="/" className="login-back">
                    Back to home
                </Link>
            </div>
        </div>
    );
}