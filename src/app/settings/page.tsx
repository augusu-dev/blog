/* eslint-disable */
"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { ThemeName, useTheme } from "@/contexts/ThemeContext";
import { writeCachedPublicUserId } from "@/lib/clientPublicUserId";

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

const THEME_OPTIONS: ThemeName[] = ["default", "lightblue", "sand", "apricot", "white", "black", "custom"];

const THEME_LABELS: Record<ThemeName, Record<"ja" | "en" | "zh", string>> = {
    default: { ja: "デフォルト", en: "Default", zh: "默认" },
    lightblue: { ja: "薄水色", en: "Light Blue", zh: "浅蓝" },
    sand: { ja: "砂色", en: "Sand", zh: "砂色" },
    apricot: { ja: "杏子色", en: "Apricot", zh: "杏色" },
    white: { ja: "白", en: "White", zh: "白色" },
    black: { ja: "黒", en: "Black", zh: "黑色" },
    custom: { ja: "カスタム", en: "Custom", zh: "自定义" },
};

export default function SettingsPage() {
    const { data: session, status, update } = useSession();
    const router = useRouter();
    const { language, setLanguage, t } = useLanguage();
    const {
        theme,
        setTheme,
        customColor,
        setCustomColor,
        commitTheme,
        resetTheme,
    } = useTheme();
    const locale = language as "ja" | "en" | "zh";

    const [name, setName] = useState("");
    const [userId, setUserId] = useState("");
    const [email, setEmail] = useState("");
    const [image, setImage] = useState("");
    const [headerImage, setHeaderImage] = useState("");
    const [bio, setBio] = useState("");
    const [aboutMe, setAboutMe] = useState("");
    const [links, setLinks] = useState<SocialLink[]>([]);
    const [myPosts, setMyPosts] = useState<Post[]>([]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [showRestoreModal, setShowRestoreModal] = useState(false);
    const [restoreConfirmed, setRestoreConfirmed] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const restoreInputRef = useRef<HTMLInputElement | null>(null);
    const resetThemeOnLeaveRef = useRef(resetTheme);
    const loadedRef = useRef(false);

    const themeTitle = locale === "en" ? "Site Color" : locale === "zh" ? "站点颜色" : "サイトカラー";
    const themeDescription =
        locale === "en"
            ? "Choose a color theme for Next Blog."
            : locale === "zh"
                ? "选择 Next Blog 的主题颜色。"
                : "Next Blog の配色を変更できます。";
    const customColorLabel =
        locale === "en" ? "Custom color" : locale === "zh" ? "自定义颜色" : "カスタムカラー";

    const backButtonLabel = locale === "en" ? "Back" : locale === "zh" ? "杩斿洖" : "戻る";
    const restoreButtonLabel = locale === "en" ? "Restore" : locale === "zh" ? "鎭㈠師" : "復元";
    const restoreDialogTitle =
        locale === "en" ? "Restore from Backup" : locale === "zh" ? "浠庡浠戒腑鎭㈠師" : "バックアップから復元";
    const restoreDialogMessage =
        locale === "en"
            ? "When you restore, only the data contained in the selected JSON file will be applied to this account. Any newer posts or settings currently saved on this account and not included in the file may be overwritten or removed, so please export a fresh backup before continuing."
            : locale === "zh"
                ? "鎭㈠師鍚庯紝鍙細灏嗘墍閫夌殑 JSON 鏂囦欢涓寘鍚殑鏁版嵁鍙嶆槧鍒拌繖涓处鍙枫�傚綋鍓嶈处鍙蜂腑鍚庢潵鏂板銆佷絾涓嶅湪鏂囦欢鍐呯殑鍐呭锛屽彲鑳戒細琚鐩栨垨鍒犻櫎銆傝鍦ㄧ户缁箣鍓嶅厛瀵煎嚭鏈�鏂扮殑澶囦唤銆�"
                : "復元を実行すると、選択した JSON ファイルに含まれる内容だけがこのアカウントへ反映されます。現在のアカウントにある投稿や設定のうち、ファイルに含まれていない新しい内容は上書きまたは削除される可能性があるため、続行する前に最新のバックアップを書き出しておくことをおすすめします。";
    const restoreConfirmLabel =
        locale === "en" ? "I understand the warning" : locale === "zh" ? "鎴戝凡纭涓婅堪鍐呭" : "注意事項を確認しました";
    const restoreSelectLabel =
        locale === "en" ? "Choose JSON File" : locale === "zh" ? "閫夋嫨 JSON 鏂囦欢" : "JSON ファイルを選ぶ";
    const restoreCancelLabel = locale === "en" ? "Cancel" : locale === "zh" ? "鍙栨秷" : "キャンセル";
    const restoreLoadingLabel = locale === "en" ? "Restoring..." : locale === "zh" ? "鎭㈠師涓..." : "復元中...";
    const backupReminderMessage =
        locale === "en"
            ? "We take care to preserve your data, but unexpected issues can still cause data loss. Please export backups regularly for anything important."
            : locale === "zh"
                ? "我们会尽力妥善保存数据，但仍无法完全排除因意外问题导致数据丢失的可能。重要内容请定期导出备份保存。"
                : "当サイトではデータの保全に努めていますが、予期しない不具合などでデータが失われる可能性を完全にはなくせません。大切な内容は、こまめにバックアップを書き出して保管してください。";

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const loadJsonWithRetry = async (url: string, maxAttempts = 2) => {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            try {
                const res = await fetch(url, { cache: "no-store" });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    return { ok: true as const, data };
                }
                if (res.status >= 400 && res.status < 500) {
                    return { ok: false as const, data: null };
                }
            } catch {
                // retry
            }

            if (attempt < maxAttempts - 1) {
                await wait(250 * (attempt + 1));
            }
        }

        return { ok: false as const, data: null };
    };

    const hydrateFromPublicProfile = async (): Promise<boolean> => {
        try {
            const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
            const sessionPayload = await sessionRes
                .json()
                .catch(() => ({} as { user?: { id?: string; userId?: string } }));
            const refs = [sessionPayload.user?.userId, sessionPayload.user?.id].filter(
                (value, index, array): value is string =>
                    typeof value === "string" && value.trim().length > 0 && array.indexOf(value) === index
            );
            if (!sessionRes.ok || refs.length === 0) return false;

            let profile: Record<string, any> | null = null;
            for (const ref of refs) {
                const result = await loadJsonWithRetry(`/api/user/${encodeURIComponent(ref)}`, 1);
                if (result.ok && result.data && typeof result.data === "object") {
                    profile = result.data as Record<string, any>;
                    break;
                }
            }
            if (!profile) return false;

            applySettingsPayload({
                ...profile,
                userId: profile.userId || refs[0] || "",
            });
            writeCachedPublicUserId((session?.user as { id?: string } | undefined)?.id, profile.userId);
            return true;
        } catch {
            // ignore fallback load failure
            return false;
        }
    };

    const applySettingsPayload = (data: Record<string, any>) => {
        const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(data, key);
        const getString = (value: unknown) => (typeof value === "string" ? value : "");

        if (hasOwn("name")) setName(getString(data.name));
        if (hasOwn("userId")) setUserId(getString(data.userId));
        if (hasOwn("email")) setEmail(getString(data.email));
        if (hasOwn("image")) setImage(getString(data.image));
        if (hasOwn("headerImage")) setHeaderImage(getString(data.headerImage));
        if (hasOwn("bio")) setBio(getString(data.bio));
        if (hasOwn("aboutMe")) setAboutMe(getString(data.aboutMe));
        if (hasOwn("links")) setLinks(Array.isArray(data.links) ? data.links : []);
    };

    const loadSettingsData = async (options?: { silent?: boolean }): Promise<boolean> => {
        const result = await loadJsonWithRetry("/api/user/settings", 2);
        const data = result.data;
        if (result.ok && data && typeof data === "object") {
            applySettingsPayload(data as Record<string, any>);
            writeCachedPublicUserId((session?.user as { id?: string } | undefined)?.id, (data as Record<string, any>).userId);
            setMessage("");
            return true;
        }

        const hydrated = await hydrateFromPublicProfile();
        if (!hydrated && !options?.silent) {
            setMessage("Error: settings-load");
        } else if (hydrated) {
            setMessage("");
        }
        return hydrated;
    };

    const loadMyPosts = async (): Promise<void> => {
        const result = await loadJsonWithRetry("/api/posts/my", 2);
        if (!result.ok || !Array.isArray(result.data)) {
            setMyPosts([]);
            return;
        }
        setMyPosts(result.data as Post[]);
    };

    const handleBack = () => {
        if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
            return;
        }
        router.push("/");
    };

    const closeRestoreModal = () => {
        if (restoring) return;
        setShowRestoreModal(false);
        setRestoreConfirmed(false);
    };

    const handleRestoreFileChange = async (
        event: ChangeEvent<HTMLInputElement>
    ): Promise<void> => {
        const file = event.target.files?.[0];
        event.target.value = "";

        if (!file) return;

        setRestoring(true);
        setMessage("");

        try {
            const raw = await file.text();
            const res = await fetch("/api/user/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: raw,
            });
            const payload = await res.json().catch(() => ({} as Record<string, any>));

            if (!res.ok) {
                setMessage(`❌ ${payload.error || "restore-failed"}`);
                return;
            }

            if (payload.user && typeof payload.user === "object") {
                applySettingsPayload(payload.user as Record<string, any>);
                writeCachedPublicUserId(
                    (session?.user as { id?: string } | undefined)?.id,
                    (payload.user as Record<string, any>).userId
                );
            }

            if (payload.user?.theme && payload.user?.themeCustomColor) {
                commitTheme(payload.user.theme as ThemeName, payload.user.themeCustomColor as string);
            }

            await Promise.all([update(), loadMyPosts(), loadSettingsData()]);
            setMessage(
                locale === "en"
                    ? "Backup restored."
                    : locale === "zh"
                        ? "澶囦唤宸叉仮澶嶃�"
                        : "バックアップを復元しました。"
            );
            setShowRestoreModal(false);
            setRestoreConfirmed(false);
            setMessage(
                locale === "en"
                    ? "Backup restored."
                    : locale === "zh"
                        ? "已恢复备份。"
                        : "バックアップを復元しました。"
            );
        } catch {
            setMessage("❌ restore-failed");
        } finally {
            setRestoring(false);
        }
    };

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login");
    }, [status, router]);

    useEffect(() => {
        resetThemeOnLeaveRef.current = resetTheme;
    }, [resetTheme]);

    useEffect(() => {
        return () => {
            resetThemeOnLeaveRef.current();
        };
    }, []);

    useEffect(() => {
        if (session && !loadedRef.current) {
            loadedRef.current = true;
            setEmail(session.user?.email || "");
            setName(session.user?.name || "");
            setImage((session.user as { image?: string | null } | undefined)?.image || "");
            void (async () => {
                await loadSettingsData({ silent: true });
                await loadMyPosts();
            })();
            return;

            const loadSettings = async (): Promise<void> => {
                const result = await loadJsonWithRetry("/api/user/settings", 4);
                const data = result.data;
                if (!result.ok || !data || typeof data !== "object") {
                    setMessage("❌ 設定情報の取得に失敗しました。");
                    await hydrateFromPublicProfile();
                    return;
                }
                applySettingsPayload(data as Record<string, any>);
                setMessage("");
            };

            void loadSettings().catch(async () => {
                setMessage("❌ 設定情報の取得に失敗しました。");
                await hydrateFromPublicProfile();
            });

            void loadJsonWithRetry("/api/posts/my", 4)
                .then((result) => {
                    if (!result.ok || !Array.isArray(result.data)) {
                        setMyPosts([]);
                        return;
                    }
                    setMyPosts(result.data);
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
                body: JSON.stringify({
                    name,
                    userId,
                    bio,
                    aboutMe,
                    links,
                    image,
                    headerImage,
                    theme,
                    themeCustomColor: customColor,
                }),
            });
            const payload = await res.json().catch(() => ({}));
            if (res.ok) {
                if (payload && typeof payload === "object") {
                    applySettingsPayload(payload as Record<string, any>);
                    writeCachedPublicUserId(
                        (session?.user as { id?: string } | undefined)?.id,
                        (payload as Record<string, any>).userId
                    );
                }
                commitTheme(
                    (payload.theme as ThemeName | undefined) || theme,
                    (payload.themeCustomColor as string | undefined) || customColor
                );
                setMessage("✅ " + t("設定を保存しました。"));
                await update();
            } else {
                setMessage(`❌ ${payload.error || t("保存に失敗しました。")}`);
            }
        } catch {
            setMessage("❌ " + t("エラーが発生しました。"));
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
        const confirm1 = confirm(t("本当にアカウントを削除しますか？\n※この操作は取り消せません。"));
        if (!confirm1) return;
        const confirm2 = confirm(t("すべての投稿データも削除されます。本当に削除しますか？"));
        if (!confirm2) return;

        try {
            const res = await fetch("/api/user/settings", { method: "DELETE" });
            if (res.ok) {
                await signOut({ callbackUrl: "/" });
            } else {
                setMessage("❌ " + t("アカウント削除に失敗しました。"));
            }
        } catch {
            setMessage("❌ " + t("エラーが発生しました。"));
        }
    };

    const togglePinned = async (post: Post) => {
        const isPinned = !post.pinned;
        if (isPinned) {
            const currentlyPinned = myPosts.filter((p: any) => !!p.pinned && !!p.published);
            if (currentlyPinned.length >= 5) {
                setMessage("❌ " + t("おすすめは最大5つまでです"));
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
                    <p style={{ color: "var(--text-soft)" }}>{t("読み込み中...")}</p>
                </div>
            </div>
        );
    }

    if (!session) return null;

    return (
        <>
            <nav className="navbar" style={{ justifyContent: "center" }}>
                <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>
                    <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                    Next Blog <span className="beta-badge">β</span>
                </Link>
            </nav>

            <div className="editor-container" style={{ maxWidth: 600 }}>
                <div className="settings-page-title-row">
                    <h1 style={{ fontFamily: "var(--serif)", fontSize: 28, fontWeight: 400, marginBottom: 0 }}>{t("設定")}</h1>
                    <button
                        type="button"
                        className="settings-back-btn"
                        onClick={handleBack}
                        aria-label={backButtonLabel}
                        title={backButtonLabel}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </button>
                </div>
                <div style={{ marginTop: -12, marginBottom: 24 }}>
                    <Link
                        href="/settings/collab"
                        className="editor-btn editor-btn-secondary"
                        style={{ textDecoration: "none", display: "inline-block" }}
                    >
                        PR / DM 設定
                    </Link>
                    <Link
                        href="/messages"
                        className="editor-btn editor-btn-secondary"
                        style={{ textDecoration: "none", display: "inline-block", marginLeft: 8 }}
                    >
                        DM履歴
                    </Link>
                </div>

                {message && (
                    <div className={`login-message ${message.startsWith("❌") || message.startsWith("Error:") ? "login-error" : ""}`} style={{ marginBottom: 20 }}>
                        {message}
                    </div>
                )}

                {/* 言語設定 */}
                <section style={{ marginBottom: 40 }}>
                    <h2 className="settings-section-title">{t("言語設定")}</h2>
                    <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                        <button
                            className={`editor-btn ${language === 'ja' ? 'editor-btn-primary' : 'editor-btn-secondary'}`}
                            style={{ padding: "8px 16px" }}
                            onClick={() => setLanguage('ja')}
                        >
                            日本語
                        </button>
                        <button
                            className={`editor-btn ${language === 'en' ? 'editor-btn-primary' : 'editor-btn-secondary'}`}
                            style={{ padding: "8px 16px" }}
                            onClick={() => setLanguage('en')}
                        >
                            English
                        </button>
                        <button
                            className={`editor-btn ${language === 'zh' ? 'editor-btn-primary' : 'editor-btn-secondary'}`}
                            style={{ padding: "8px 16px" }}
                            onClick={() => setLanguage('zh')}
                        >
                            中文
                        </button>
                    </div>
                </section>

                <section style={{ marginBottom: 40 }}>
                    <h2 className="settings-section-title">{themeTitle}</h2>
                    <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 12 }}>
                        {themeDescription}
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        {THEME_OPTIONS.map((option) => (
                            <button
                                key={option}
                                type="button"
                                className={`editor-btn ${theme === option ? "editor-btn-primary" : "editor-btn-secondary"}`}
                                style={{ padding: "8px 14px" }}
                                onClick={() => setTheme(option)}
                            >
                                {THEME_LABELS[option][locale]}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "var(--text-soft)" }}>{customColorLabel}</span>
                        <input
                            type="color"
                            value={customColor}
                            onChange={(e) => setCustomColor(e.target.value)}
                            style={{ width: 36, height: 28, border: "none", background: "transparent", cursor: "pointer" }}
                            aria-label={customColorLabel}
                        />
                        {theme !== "custom" ? (
                            <button
                                type="button"
                                className="editor-btn editor-btn-secondary"
                                style={{ padding: "6px 12px", fontSize: 12 }}
                                onClick={() => setTheme("custom")}
                            >
                                {locale === "en" ? "Apply custom" : locale === "zh" ? "应用自定义" : "カスタムを適用"}
                            </button>
                        ) : null}
                    </div>
                </section>

                {/* プロフィール */}
                <section style={{ marginBottom: 40 }}>
                    <h2 className="settings-section-title">{t("プロフィール")}</h2>

                    <label className="settings-label">{t("ユーザー名")}</label>
                    <input type="text" className="login-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ユーザー名")} style={{ marginBottom: 16 }} />

                    <label className="settings-label">ユーザーID</label>
                    <input
                        type="text"
                        className="login-input"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        placeholder="user_id"
                        style={{ marginBottom: 4 }}
                    />
                    <p style={{ fontSize: 11, color: "var(--azuki-light)", marginBottom: 16 }}>
                        3〜32文字: 半角小文字・数字・アンダースコアのみ。URLに反映されます。
                    </p>

                    <label className="settings-label">{t("プロフィール画像")}</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                        <div style={{
                            width: 60, height: 60, borderRadius: "50%", background: "var(--bg-soft)",
                            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "1px solid var(--border)"
                        }}>
                            {image ? <img src={image} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: "var(--text-soft)", fontSize: 24 }}>👤</span>}
                        </div>
                        <label className="editor-btn editor-btn-secondary" style={{ cursor: "pointer", fontSize: 13, padding: "6px 14px" }}>
                            {t("画像を選択 (最大4.5MB)")}
                            <input
                                type="file"
                                accept="image/*"
                                style={{ display: "none" }}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    if (file.size > 4.5 * 1024 * 1024) {
                                        setMessage("❌ " + t("4.5MB以下の画像を選択してください"));
                                        return;
                                    }
                                    setMessage(t("画像をアップロード中..."));
                                    const formData = new FormData();
                                    formData.append("file", file);
                                    try {
                                        const res = await fetch("/api/upload", { method: "POST", body: formData });
                                        if (res.ok) {
                                            const data = await res.json();
                                            setImage(data.url);
                                            setMessage("");
                                        } else {
                                            const err = await res.json();
                                            setMessage("❌ " + (err.error || t("アップロード失敗")));
                                        }
                                    } catch (err) {
                                        setMessage("❌ " + t("予期せぬエラーが発生しました"));
                                    } finally {
                                        e.target.value = "";
                                    }
                                }}
                            />
                        </label>
                    </div>

                    <label className="settings-label">{t("ヘッダー画像")}</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                        <div style={{
                            width: 120, height: 40, borderRadius: 8, background: "var(--bg-soft)",
                            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", border: "1px solid var(--border)"
                        }}>
                            {headerImage ? <img src={headerImage} alt="Header" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: "var(--text-soft)", fontSize: 12 }}>{t("未設定")}</span>}
                        </div>
                        <label className="editor-btn editor-btn-secondary" style={{ cursor: "pointer", fontSize: 13, padding: "6px 14px" }}>
                            {t("画像を選択 (最大4.5MB)")}
                            <input
                                type="file"
                                accept="image/*"
                                style={{ display: "none" }}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    if (file.size > 4.5 * 1024 * 1024) {
                                        setMessage("❌ " + t("4.5MB以下の画像を選択してください"));
                                        return;
                                    }
                                    setMessage(t("ヘッダー画像をアップロード中..."));
                                    const formData = new FormData();
                                    formData.append("file", file);
                                    try {
                                        const res = await fetch("/api/upload", { method: "POST", body: formData });
                                        if (res.ok) {
                                            const data = await res.json();
                                            setHeaderImage(data.url);
                                            setMessage("");
                                        } else {
                                            const err = await res.json();
                                            setMessage("❌ " + (err.error || t("アップロード失敗")));
                                        }
                                    } catch (err) {
                                        setMessage("❌ " + t("予期せぬエラーが発生しました"));
                                    } finally {
                                        e.target.value = "";
                                    }
                                }}
                            />
                        </label>
                    </div>

                    <label className="settings-label">{t("メールアドレス")}</label>
                    <input type="email" className="login-input" value={email} disabled style={{ marginBottom: 4, opacity: 0.6 }} />
                    <p style={{ fontSize: 11, color: "var(--azuki-light)", marginBottom: 16 }}>{t("メールアドレスは変更できません")}</p>

                    <label className="settings-label">{t("自己紹介 (短め・ホーム用)")}</label>
                    <textarea
                        className="login-input"
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder={t("一行から二行程度の自己紹介...")}
                        rows={2}
                        style={{ marginBottom: 16, resize: "vertical", fontFamily: "var(--sans)" }}
                    />

                    <label className="settings-label">{t("About me (長めのプロフ・詳細用)")}</label>
                    <textarea
                        className="login-input"
                        value={aboutMe}
                        onChange={(e) => setAboutMe(e.target.value)}
                        placeholder={t("自分について詳しく紹介してください...")}
                        rows={6}
                        style={{ marginBottom: 16, resize: "vertical", fontFamily: "var(--sans)" }}
                    />
                </section>

                {/* SNSリンク */}
                <section style={{ marginBottom: 40 }}>
                    <h2 className="settings-section-title">{t("リンク / SNS")}</h2>
                    <p style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 16 }}>
                        {t("URLを入力するとあなたのプロフィールに表示されます。クリックで新しいタブで開きます。")}
                    </p>

                    {links.map((link, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                            <input
                                type="text"
                                className="login-input"
                                value={link.label}
                                onChange={(e) => updateLink(i, "label", e.target.value)}
                                placeholder={t("名前 (例: GitHub)")}
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
                        {links.length >= 5 ? t("最大5つまで") : `${t("＋ リンクを追加")} (${links.length}/5)`}
                    </button>
                </section>

                {/* おすすめ設定 */}
                <section style={{ marginBottom: 40 }}>
                    <h2 className="settings-section-title">{t("おすすめの表示設定")}</h2>
                    <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
                        {t("あなたのプロフィールに「おすすめ」として表示されるコンテンツを選べます。")}<br />
                        {t("（最大5つまで）")}
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
                                        <span style={{ fontSize: 12, color: "var(--text-soft)" }}>{t("おすすめ表示")}</span>
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
                            <p style={{ fontSize: 13, color: "var(--text-soft)" }}>{t("公開済みの記事やプロダクトがありません。")}</p>
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
                    {saving ? t("保存中...") : t("設定を保存")}
                </button>

                {/* データとバックアップ */}
                <section style={{ borderTop: "1px solid var(--border)", paddingTop: 32, paddingBottom: 32 }}>
                    <h2 className="settings-section-title">{t("データとバックアップ")}</h2>
                    <p style={{ fontSize: 13, color: "var(--text-soft)", marginBottom: 16 }}>
                        {t("あなたの設定、自己紹介、そしてこれまで投稿したすべての記事やプロダクトのデータをJSON形式でエクスポート（ダウンロード）できます。")}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-soft)", marginTop: -4, marginBottom: 16 }}>
                        {backupReminderMessage}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                        <a
                            href="/api/user/export"
                            download
                            className="editor-btn editor-btn-secondary"
                            style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}
                        >
                            {t("データをエクスポート")}
                        </a>
                        <button
                            type="button"
                            className="editor-btn editor-btn-danger"
                            onClick={() => {
                                setRestoreConfirmed(false);
                                setShowRestoreModal(true);
                            }}
                        >
                            {restoreButtonLabel}
                        </button>
                        <input
                            ref={restoreInputRef}
                            type="file"
                            accept="application/json,.json"
                            style={{ display: "none" }}
                            onChange={(event) => {
                                void handleRestoreFileChange(event);
                            }}
                        />
                    </div>
                </section>

                {/* 危険ゾーン */}
                <section style={{ borderTop: "1px solid var(--border)", paddingTop: 32 }}>
                    <h2 className="settings-section-title" style={{ color: "#c44" }}>{t("危険な操作")}</h2>

                    <button
                        className="editor-btn editor-btn-secondary"
                        onClick={() => signOut({ callbackUrl: "/" })}
                        style={{ width: "100%", marginBottom: 12 }}
                    >
                        {t("ログアウト")}
                    </button>

                    <button
                        className="editor-btn editor-btn-danger"
                        onClick={handleDeleteAccount}
                        style={{ width: "100%" }}
                    >
                        {t("アカウントを削除する")}
                    </button>
                    <p style={{ fontSize: 11, color: "#c44", marginTop: 8 }}>
                        {t("アカウントを削除すると、すべての投稿データも完全に削除されます。")}
                    </p>
                </section>

                {showRestoreModal ? (
                    <div className="restore-modal-backdrop" onClick={closeRestoreModal}>
                        <div className="restore-modal-card" onClick={(event) => event.stopPropagation()}>
                            <h3 className="restore-modal-title">{restoreDialogTitle}</h3>
                            <p className="restore-modal-copy">{restoreDialogMessage}</p>
                            <label className="restore-modal-check">
                                <input
                                    type="checkbox"
                                    checked={restoreConfirmed}
                                    onChange={(event) => setRestoreConfirmed(event.target.checked)}
                                    disabled={restoring}
                                />
                                <span>{restoreConfirmLabel}</span>
                            </label>
                            <div className="restore-modal-actions">
                                <button
                                    type="button"
                                    className="editor-btn editor-btn-secondary"
                                    onClick={closeRestoreModal}
                                    disabled={restoring}
                                >
                                    {restoreCancelLabel}
                                </button>
                                <button
                                    type="button"
                                    className="editor-btn editor-btn-danger"
                                    onClick={() => restoreInputRef.current?.click()}
                                    disabled={!restoreConfirmed || restoring}
                                >
                                    {restoring ? restoreLoadingLabel : restoreSelectLabel}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </>
    );
}
