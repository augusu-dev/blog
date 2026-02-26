"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { upload } from '@vercel/blob/client';

interface SocialLink {
    label: string;
    url: string;
}

interface Post {
    id: string;
    title: string;
    tags: string[];
    pinned: boolean;
    published: boolean;
}

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [image, setImage] = useState("");
    const [headerImage, setHeaderImage] = useState("");
    const [bio, setBio] = useState("");
    const [aboutMe, setAboutMe] = useState("");
    const [links, setLinks] = useState<SocialLink[]>([]);
    const [myPosts, setMyPosts] = useState<Post[]>([]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login");
    }, [status, router]);

    useEffect(() => {
        if (session) {
            setEmail(session.user?.email || "");
            fetch("/api/user/settings")
                .then((r) => r.json())
                .then((data) => {
                    setName(data.name || "");
                    setImage(data.image || "");
                    setHeaderImage(data.headerImage || "");
                    setBio(data.bio || "");
                    setAboutMe(data.aboutMe || "");
                    setLinks(data.links || []);
                })
                .catch(() => { });
            fetch("/api/posts/my")
                .then((r) => r.json())
                .then((posts) => setMyPosts(posts))
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
                body: JSON.stringify({ name, bio, aboutMe, links, image, headerImage }),
            });
            if (res.ok) setMessage("✅ 設定を保存しました。");
            else setMessage("❌ 保存に失敗しました。");
        } catch {
            setMessage("❌ エラーが発生しました。");
        } finally {
            setSaving(false);
        }
    };

    const addLink = () => {
        if (links.length >= 5) return;
        setLinks([...links, { label: "", url: "" }]);
    };

    const updateLink = (i: number, field: "label" | "url", value: string) => {
        const updated = [...links];
        updated[i][field] = value;
        setLinks(updated);
    };

    const removeLink = (i: number) => {
        setLinks(links.filter((_, idx) => idx !== i));
    };

    const handleDeleteAccount = async () => {
        const confirm1 = confirm("本当にアカウントを削除しますか？この操作は取り消せません。");
        if (!confirm1) return;
        const confirm2 = confirm("すべての投稿データも削除されます。本当に削除しますか？");
        if (!confirm2) return;

        try {
            const res = await fetch("/api/user/settings", { method: "DELETE" });
            if (res.ok) {
                await signOut({ callbackUrl: "/" });
            } else {
                setMessage("❌ アカウント削除に失敗しました。");
            }
        } catch {
            setMessage("❌ エラーが発生しました。");
        }
    };

    const togglePinned = async (post: Post) => {
        const isPinned = !post.pinned;
        if (isPinned) {
            const isProduct = post.tags?.includes("product");
            const currentlyPinned = myPosts.filter((p: any) => !!p.pinned && !!p.published && (isProduct ? p.tags?.includes("product") : !p.tags?.includes("product")));
            if (isProduct && currentlyPinned.length >= 2) {
                setMessage("❌ プロダクトのおすすめは最大2つまでです");
                return;
            }
            if (!isProduct && currentlyPinned.length >= 3) {
                setMessage("❌ Blogのおすすめは最大3つまでです");
                return;
            }
        }

        setMyPosts(myPosts.map(p => p.id === post.id ? { ...p, pinned: isPinned } : p));
        try {
            await fetch(`/api/posts/${post.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pinned: isPinned })
            });
        } catch { }
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
                <div style={{ display: "flex", gap: 8 }}>
                    <Link href="/editor" className="nav-auth-btn nav-write-btn" style={{ textDecoration: "none" }}>
                        ✏ 記事を書く
                    </Link>
                </div>
            </nav>

            <div className="editor-container" style={{ maxWidth: 600 }}>
                <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, fontWeight: 400, marginBottom: 32 }}>設定</h1>

                {message && (
                    <div className={`login-message ${message.startsWith("❌") ? "login-error" : ""}`} style={{ marginBottom: 20 }}>
                        {message}
                    </div>
                )}

                {/* プロフィール */}
                <section style={{ marginBottom: 40 }}>
                    <h2 className="settings-section-title">プロフィール</h2>

                    <label className="settings-label">ユーザー名</label>
                    <input type="text" className="login-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ユーザー名" style={{ marginBottom: 16 }} />

                    <label className="settings-label">プロフィール画像</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                        <div style={{
                            width: 60, height: 60, borderRadius: "50%", background: "var(--bg-soft)",
                            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "1px solid var(--border)"
                        }}>
                            {image ? <img src={image} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: "var(--text-soft)", fontSize: 24 }}>👤</span>}
                        </div>
                        <label className="editor-btn editor-btn-secondary" style={{ cursor: "pointer", fontSize: 13, padding: "6px 14px" }}>
                            画像を選択 (最大6MB)
                            <input
                                type="file"
                                accept="image/*"
                                style={{ display: "none" }}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    if (file.size > 6 * 1024 * 1024) {
                                        setMessage("❌ 6MB以下の画像を選択してください");
                                        return;
                                    }
                                    setMessage("画像をアップロード中...");
                                    try {
                                        const newBlob = await upload(file.name, file, {
                                            access: 'public',
                                            handleUploadUrl: '/api/upload',
                                        });
                                        setImage(newBlob.url);
                                        setMessage("");
                                    } catch (err) {
                                        setMessage("❌ " + ((err as Error).message || "アップロード失敗"));
                                    } finally {
                                        e.target.value = "";
                                    }
                                }}
                            />
                        </label>
                    </div>

                    <label className="settings-label">ヘッダー画像</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                        <div style={{
                            width: 120, height: 40, borderRadius: 8, background: "var(--bg-soft)",
                            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "1px solid var(--border)"
                        }}>
                            {headerImage ? <img src={headerImage} alt="Header" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: "var(--text-soft)", fontSize: 12 }}>未設定</span>}
                        </div>
                        <label className="editor-btn editor-btn-secondary" style={{ cursor: "pointer", fontSize: 13, padding: "6px 14px" }}>
                            画像を選択 (最大6MB)
                            <input
                                type="file"
                                accept="image/*"
                                style={{ display: "none" }}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    if (file.size > 6 * 1024 * 1024) {
                                        setMessage("❌ 6MB以下の画像を選択してください");
                                        return;
                                    }
                                    setMessage("ヘッダー画像をアップロード中...");
                                    try {
                                        const newBlob = await upload(file.name, file, {
                                            access: 'public',
                                            handleUploadUrl: '/api/upload',
                                        });
                                        setHeaderImage(newBlob.url);
                                        setMessage("");
                                    } catch (err) {
                                        setMessage("❌ " + ((err as Error).message || "アップロード失敗"));
                                    } finally {
                                        e.target.value = "";
                                    }
                                }}
                            />
                        </label>
                    </div>

                    <label className="settings-label">メールアドレス</label>
                    <input type="email" className="login-input" value={email} disabled style={{ marginBottom: 4, opacity: 0.6 }} />
                    <p style={{ fontSize: 11, color: "var(--azuki-light)", marginBottom: 16 }}>メールアドレスは変更できません</p>

                    <label className="settings-label">自己紹介 (短め・ホーム用)</label>
                    <textarea
                        className="login-input"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="一行から二行程度の自己紹介..."
                        rows={2}
                        style={{ marginBottom: 16, resize: "vertical", fontFamily: "var(--sans)" }}
                    />

                    <label className="settings-label">About me (長めのプロフ・詳細用)</label>
                    <textarea
                        className="login-input"
                        value={aboutMe}
                        onChange={(e) => setAboutMe(e.target.value)}
                        placeholder="自分について詳しく紹介してください..."
                        rows={6}
                        style={{ marginBottom: 16, resize: "vertical", fontFamily: "var(--sans)" }}
                    />
                </section>

                {/* SNSリンク */}
                <section style={{ marginBottom: 40 }}>
                    <h2 className="settings-section-title">リンク / SNS</h2>
                    <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 16 }}>
                        URLを入力するとあなたのプロフィールに表示されます。クリックで新しいタブで開きます。
                    </p>

                    {links.map((link, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                            <input
                                type="text"
                                className="login-input"
                                value={link.label}
                                onChange={(e) => updateLink(i, "label", e.target.value)}
                                placeholder="名前 (例: GitHub)"
                                style={{ flex: "0 0 120px", marginBottom: 0 }}
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
                                onClick={() => removeLink(i)}
                                style={{
                                    background: "none", border: "none", color: "#c44", cursor: "pointer",
                                    fontSize: 18, padding: "4px 8px", flexShrink: 0,
                                }}
                            >
                                ×
                            </button>
                        </div>
                    ))}

                    <button
                        type="button"
                        className="editor-btn editor-btn-secondary"
                        onClick={addLink}
                        disabled={links.length >= 5}
                        style={{ width: "100%", marginTop: 4 }}
                    >
                        {links.length >= 5 ? "最大5つまで" : `＋ リンクを追加 (${links.length}/5)`}
                    </button>
                </section>

                {/* おすすめ設定 */}
                <section style={{ marginBottom: 40 }}>
                    <h2 className="settings-section-title">おすすめの表示設定</h2>
                    <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
                        あなたのプロフィールに「おすすめ」として表示されるコンテンツを選べます。<br />
                        （プロダクト最大2つ、Blog最大3つまで）
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {myPosts.filter((p: any) => !!p.published).map(p => {
                            const isProduct = p.tags?.includes("product");
                            return (
                                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8 }}>
                                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: isProduct ? "var(--azuki-light)" : "#888", color: "#fff" }}>
                                            {isProduct ? "Product" : "Blog"}
                                        </span>
                                        <span style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</span>
                                    </div>
                                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                        <span style={{ fontSize: 12, color: "var(--text-soft)" }}>おすすめ表示</span>
                                        <input
                                            type="checkbox"
                                            checked={!!p.pinned}
                                            onChange={() => togglePinned(p)}
                                        />
                                    </label>
                                </div>
                            );
                        })}
                        {myPosts.filter((p: any) => !!p.published).length === 0 && (
                            <p style={{ fontSize: 13, color: "var(--text-soft)" }}>公開済みの記事やプロダクトがありません。</p>
                        )}
                    </div>
                </section>

                {/* 保存 */}
                <button
                    className="editor-btn editor-btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                    style={{ width: "100%", marginBottom: 48, padding: "12px 0" }}
                >
                    {saving ? "保存中..." : "設定を保存"}
                </button>

                {/* データとバックアップ */}
                <section style={{ borderTop: "1px solid var(--border)", paddingTop: 32, paddingBottom: 32 }}>
                    <h2 className="settings-section-title">データとバックアップ</h2>
                    <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
                        あなたの設定、自己紹介、そしてこれまで投稿したすべての記事やプロダクトのデータをJSON形式でエクスポート（ダウンロード）できます。
                    </p>
                    <a
                        href="/api/user/export"
                        download
                        className="editor-btn editor-btn-secondary"
                        style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}
                    >
                        データをエクスポート
                    </a>
                </section>

                {/* 危険ゾーン */}
                <section style={{ borderTop: "1px solid var(--border)", paddingTop: 32 }}>
                    <h2 className="settings-section-title" style={{ color: "#c44" }}>危険な操作</h2>

                    <button
                        className="editor-btn editor-btn-secondary"
                        onClick={() => signOut({ callbackUrl: "/" })}
                        style={{ width: "100%", marginBottom: 12 }}
                    >
                        ログアウト
                    </button>

                    <button
                        className="editor-btn editor-btn-danger"
                        onClick={handleDeleteAccount}
                        style={{ width: "100%" }}
                    >
                        アカウントを削除
                    </button>
                    <p style={{ fontSize: 11, color: "#c44", marginTop: 8 }}>
                        アカウントを削除すると、すべての投稿データも完全に削除されます。
                    </p>
                </section>
            </div>
        </>
    );
}
