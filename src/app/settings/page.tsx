"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

interface SocialLink {
    label: string;
    url: string;
}

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { language, setLanguage } = useLanguage();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [image, setImage] = useState("");
    const [headerImage, setHeaderImage] = useState("");
    const [bio, setBio] = useState("");
    const [aboutMe, setAboutMe] = useState("");
    const [links, setLinks] = useState<SocialLink[]>([]);

    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    useEffect(() => {
        if (!session) return;

        setEmail(session.user?.email || "");

        fetch("/api/user/settings")
            .then((r) => r.json())
            .then((data) => {
                setName(data.name || "");
                setImage(data.image || "");
                setHeaderImage(data.headerImage || "");
                setBio(data.bio || "");
                setAboutMe(data.aboutMe || "");
                setLinks(Array.isArray(data.links) ? data.links : []);
            })
            .catch(() => {
                setMessage("Failed to load settings.");
            });
    }, [session]);

    const handleSave = async () => {
        setSaving(true);
        setMessage("");

        try {
            const res = await fetch("/api/user/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    bio,
                    aboutMe,
                    links,
                    image,
                    headerImage,
                }),
            });

            if (res.ok) {
                setMessage("Settings saved.");
            } else {
                const payload = await res.json().catch(() => ({}));
                setMessage(payload.error || "Failed to save settings.");
            }
        } catch {
            setMessage("Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!confirm("Delete your account? This cannot be undone.")) return;

        try {
            const res = await fetch("/api/user/settings", { method: "DELETE" });
            if (res.ok) {
                await signOut({ callbackUrl: "/" });
            } else {
                setMessage("Failed to delete account.");
            }
        } catch {
            setMessage("Failed to delete account.");
        }
    };

    const addLink = () => {
        if (links.length >= 5) return;
        setLinks((prev) => [...prev, { label: "", url: "" }]);
    };

    const updateLink = (index: number, field: "label" | "url", value: string) => {
        setLinks((prev) =>
            prev.map((link, i) => {
                if (i !== index) return link;
                return { ...link, [field]: value };
            })
        );
    };

    const removeLink = (index: number) => {
        setLinks((prev) => prev.filter((_, i) => i !== index));
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

    if (!session) return null;

    return (
        <>
            <nav className="navbar" style={{ justifyContent: "space-between" }}>
                <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>
                    <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                    Next Blog <span className="beta-badge">β</span>
                </Link>
                <div className="nav-auth">
                    <Link href="/settings/collab" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                        記事提案 / DM設定
                    </Link>
                </div>
            </nav>

            <div className="editor-container" style={{ maxWidth: 640 }}>
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 400, marginBottom: 20 }}>
                    Settings
                </h1>

                {message && (
                    <div className={`login-message ${message.toLowerCase().includes("failed") ? "login-error" : ""}`} style={{ marginBottom: 20 }}>
                        {message}
                    </div>
                )}

                <section style={{ marginBottom: 30 }}>
                    <h2 className="settings-section-title">Language</h2>
                    <div style={{ display: "flex", gap: 10 }}>
                        <button
                            className={`editor-btn ${language === "ja" ? "editor-btn-primary" : "editor-btn-secondary"}`}
                            onClick={() => setLanguage("ja")}
                        >
                            日本語
                        </button>
                        <button
                            className={`editor-btn ${language === "en" ? "editor-btn-primary" : "editor-btn-secondary"}`}
                            onClick={() => setLanguage("en")}
                        >
                            English
                        </button>
                        <button
                            className={`editor-btn ${language === "zh" ? "editor-btn-primary" : "editor-btn-secondary"}`}
                            onClick={() => setLanguage("zh")}
                        >
                            中文
                        </button>
                    </div>
                </section>

                <section style={{ marginBottom: 30 }}>
                    <h2 className="settings-section-title">Profile</h2>

                    <label className="settings-label">Name</label>
                    <input
                        type="text"
                        className="login-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        style={{ marginBottom: 12 }}
                    />

                    <label className="settings-label">Email</label>
                    <input type="email" className="login-input" value={email} disabled style={{ marginBottom: 12, opacity: 0.6 }} />

                    <label className="settings-label">Profile image URL</label>
                    <input
                        type="url"
                        className="login-input"
                        value={image}
                        onChange={(e) => setImage(e.target.value)}
                        placeholder="https://..."
                        style={{ marginBottom: 12 }}
                    />

                    <label className="settings-label">Header image URL</label>
                    <input
                        type="url"
                        className="login-input"
                        value={headerImage}
                        onChange={(e) => setHeaderImage(e.target.value)}
                        placeholder="https://..."
                        style={{ marginBottom: 12 }}
                    />

                    <label className="settings-label">Bio</label>
                    <textarea
                        className="login-input"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={2}
                        style={{ marginBottom: 12, resize: "vertical", fontFamily: "var(--sans)" }}
                    />

                    <label className="settings-label">About me</label>
                    <textarea
                        className="login-input"
                        value={aboutMe}
                        onChange={(e) => setAboutMe(e.target.value)}
                        rows={6}
                        style={{ marginBottom: 12, resize: "vertical", fontFamily: "var(--sans)" }}
                    />
                </section>

                <section style={{ marginBottom: 30 }}>
                    <h2 className="settings-section-title">Links</h2>
                    {links.map((link, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                            <input
                                type="text"
                                className="login-input"
                                value={link.label}
                                onChange={(e) => updateLink(i, "label", e.target.value)}
                                placeholder="Label"
                                style={{ flex: "0 0 130px", marginBottom: 0 }}
                            />
                            <input
                                type="url"
                                className="login-input"
                                value={link.url}
                                onChange={(e) => updateLink(i, "url", e.target.value)}
                                placeholder="https://..."
                                style={{ flex: 1, marginBottom: 0 }}
                            />
                            <button
                                type="button"
                                className="editor-btn editor-btn-danger"
                                onClick={() => removeLink(i)}
                                style={{ padding: "6px 10px" }}
                            >
                                Remove
                            </button>
                        </div>
                    ))}

                    <button type="button" className="editor-btn editor-btn-secondary" onClick={addLink} disabled={links.length >= 5}>
                        {links.length >= 5 ? "Max 5 links" : `Add link (${links.length}/5)`}
                    </button>
                </section>

                <button
                    type="button"
                    className="editor-btn editor-btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                    style={{ width: "100%", marginBottom: 32 }}
                >
                    {saving ? "Saving..." : "Save settings"}
                </button>

                <section style={{ borderTop: "1px solid var(--border)", paddingTop: 24 }}>
                    <h2 className="settings-section-title" style={{ color: "#c44" }}>Account</h2>
                    <button
                        type="button"
                        className="editor-btn editor-btn-secondary"
                        onClick={() => signOut({ callbackUrl: "/" })}
                        style={{ width: "100%", marginBottom: 10 }}
                    >
                        Log out
                    </button>
                    <button
                        type="button"
                        className="editor-btn editor-btn-danger"
                        onClick={handleDeleteAccount}
                        style={{ width: "100%" }}
                    >
                        Delete account
                    </button>
                </section>
            </div>
        </>
    );
}