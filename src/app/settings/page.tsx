"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [github, setGithub] = useState("");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    useEffect(() => {
        if (session) {
            setName(session.user?.name || "");
            setEmail(session.user?.email || "");
            // Load full profile
            fetch("/api/user/settings")
                .then((r) => r.json())
                .then((data) => {
                    if (data.name) setName(data.name);
                    if (data.image) setGithub(data.image); // image field stores GitHub URL
                })
                .catch(() => { });
        }
    }, [session]);

    const handleSave = async () => {
        setSaving(true);
        setMessage("");
        try {
            const res = await fetch("/api/user/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, image: github }),
            });
            if (res.ok) {
                setMessage("✅ 設定を保存しました。");
            } else {
                setMessage("❌ 保存に失敗しました。");
            }
        } catch {
            setMessage("❌ エラーが発生しました。");
        } finally {
            setSaving(false);
        }
    };

    const handleSignOut = async () => {
        await signOut({ callbackUrl: "/" });
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

    return (
        <>
            <nav className="navbar" style={{ justifyContent: "space-between" }}>
                <Link href="/" className="nav-logo">
                    <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                    Next Blog
                </Link>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Link href="/editor" className="nav-auth-btn nav-write-btn">
                        記事を書く
                    </Link>
                </div>
            </nav>

            <div className="editor-container" style={{ maxWidth: 600 }}>
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, fontWeight: 400, marginBottom: 32, letterSpacing: "0.04em" }}>
                    設定
                </h1>

                {message && (
                    <div className={`login-message ${message.startsWith("❌") ? "login-error" : ""}`} style={{ marginBottom: 20 }}>
                        {message}
                    </div>
                )}

                {/* Profile */}
                <div style={{ marginBottom: 32 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>プロフィール</h2>

                    <label style={{ fontSize: 13, color: "var(--text-soft)", display: "block", marginBottom: 6 }}>ユーザー名</label>
                    <input
                        type="text"
                        className="login-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="ユーザー名"
                        style={{ marginBottom: 16 }}
                    />

                    <label style={{ fontSize: 13, color: "var(--text-soft)", display: "block", marginBottom: 6 }}>メールアドレス</label>
                    <input
                        type="email"
                        className="login-input"
                        value={email}
                        disabled
                        style={{ marginBottom: 16, opacity: 0.6 }}
                    />
                    <p style={{ fontSize: 11, color: "var(--azuki-light)", marginTop: -10, marginBottom: 16 }}>
                        メールアドレスは変更できません
                    </p>

                    <label style={{ fontSize: 13, color: "var(--text-soft)", display: "block", marginBottom: 6 }}>GitHub URL</label>
                    <input
                        type="url"
                        className="login-input"
                        value={github}
                        onChange={(e) => setGithub(e.target.value)}
                        placeholder="https://github.com/username"
                        style={{ marginBottom: 16 }}
                    />
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 12, marginBottom: 48 }}>
                    <button
                        className="editor-btn editor-btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                        style={{ flex: 1 }}
                    >
                        {saving ? "保存中..." : "設定を保存"}
                    </button>
                </div>

                {/* Danger zone */}
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 32 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#c44" }}>アカウント</h2>
                    <button
                        className="editor-btn editor-btn-danger"
                        onClick={handleSignOut}
                        style={{ width: "100%" }}
                    >
                        ログアウト
                    </button>
                </div>
            </div>
        </>
    );
}
