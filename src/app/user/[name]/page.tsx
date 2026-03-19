/* eslint-disable */
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import PostComments from "@/components/PostComments";
import UnreadDmButton from "@/components/UnreadDmButton";
import { useMyPageHref } from "@/hooks/useMyPageHref";
import { prepareRenderedPostHtml } from "@/lib/postContent";
import {
    buildUserPostPath,
    buildUserProfilePath,
    consumePostReturnPath,
    rememberPostReturnPath,
} from "@/lib/postNavigation";

/* ─── Types ─── */
interface Post {
    id: string;
    title: string;
    content?: string;
    excerpt?: string;
    headerImage?: string;
    tags: string[];
    published?: boolean;
    createdAt: string;
    slug?: string;
    date?: string;
}

interface SocialLink {
    label: string;
    url: string;
}

interface UserProfile {
    id: string;
    userId?: string | null;
    name: string;
    email: string;
    image?: string | null;
    headerImage?: string | null;
    bio: string;
    aboutMe: string;
    links: SocialLink[];
    dmSetting?: "OPEN" | "PR_ONLY" | "CLOSED";
    posts: Post[];
}

type SectionId = "home" | "blog" | "product" | "about";

/* ─── Tag colors ─── */
const TAG_COLORS: Record<string, string> = {
    "AI": "#d4877a", "思考": "#8a7a6b", "コード": "#6b7a8a",
    "3D": "#8a6b7a", "哲学": "#7a6b8a", "テクノロジー": "#d4877a",
    "社会": "#6b8a7a", "作品": "#7a8a6b", "ツール": "#6b8a8a",
    "デザイン": "#8a6b6b", "言語": "#6b6b8a",
};

function Tag({ label }: { label: string }) {
    const c = TAG_COLORS[label] || "#9b6b6b";
    const displayLabel = label === "ai-generated" ? "AIで作成" : label;
    return (
        <span className="tag" style={{ color: c, background: c + "18", border: `1px solid ${c}30` }}>
            {displayLabel}
        </span>
    );
}

function fmtDate(d: string) {
    if (!d) return "";
    try {
        const date = new Date(d);
        return new Intl.DateTimeFormat("ja-JP", {
            timeZone: "Asia/Tokyo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(date).replace(/\//g, ".");
    } catch {
        return d.substring(0, 10).replace(/-/g, ".");
    }
}

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function SectionTabIcon({ section }: { section: SectionId }) {
    if (section === "home") {
        return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
    }
    if (section === "blog") {
        return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>;
    }
    if (section === "product") {
        return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>;
    }
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}

const SECTION_TABS: Array<{ id: SectionId; label: string }> = [
    { id: "home", label: "Home" },
    { id: "blog", label: "Blog" },
    { id: "product", label: "Product" },
    { id: "about", label: "About me" },
];

const PROFILE_CACHE_PREFIX = "user-profile-cache";
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeProfileRef(value: unknown): string {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function buildProfileCacheKey(userRef: string): string {
    return `${PROFILE_CACHE_PREFIX}:${userRef}`;
}

function readCachedUserProfile(...refs: Array<string | null | undefined>): UserProfile | null {
    if (typeof window === "undefined") return null;

    for (const ref of refs) {
        const normalizedRef = normalizeProfileRef(ref);
        if (!normalizedRef) continue;

        try {
            const raw = sessionStorage.getItem(buildProfileCacheKey(normalizedRef));
            if (!raw) continue;

            const parsed = JSON.parse(raw) as { savedAt?: unknown; profile?: UserProfile };
            const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
            if (!parsed.profile || Date.now() - savedAt > PROFILE_CACHE_TTL_MS) {
                sessionStorage.removeItem(buildProfileCacheKey(normalizedRef));
                continue;
            }

            return parsed.profile;
        } catch {
            // Ignore malformed cache payloads.
        }
    }

    return null;
}

function writeCachedUserProfile(profile: UserProfile, ...refs: Array<string | null | undefined>) {
    if (typeof window === "undefined") return;

    const payload = JSON.stringify({
        savedAt: Date.now(),
        profile,
    });
    const normalizedRefs = [...new Set(refs.map((ref) => normalizeProfileRef(ref)).filter(Boolean))];

    for (const ref of normalizedRefs) {
        try {
            sessionStorage.setItem(buildProfileCacheKey(ref), payload);
        } catch {
            // Ignore cache write failures.
        }
    }
}

function mergeProfileWithCachedPosts(nextProfile: UserProfile, cachedProfile: UserProfile | null): UserProfile {
    if (!cachedProfile || !Array.isArray(cachedProfile.posts) || cachedProfile.posts.length === 0) {
        return nextProfile;
    }

    if (Array.isArray(nextProfile.posts) && nextProfile.posts.length > 0) {
        return nextProfile;
    }

    return {
        ...nextProfile,
        posts: cachedProfile.posts,
    };
}

type UserPageProps = {
    requestedPostId?: string | null;
};

export default function UserPage({ requestedPostId: requestedPostIdProp = null }: UserPageProps = {}) {
    const { data: session } = useSession();
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const userName = params.name as string;
    const searchParamsString = searchParams.toString();
    const requestedPostId = (requestedPostIdProp || searchParams.get("post") || "").trim();
    const sessionUser = session?.user as {
        id?: string;
        userId?: string | null;
        name?: string | null;
        email?: string | null;
        image?: string | null;
    } | undefined;
    const sessionUserId = typeof sessionUser?.id === "string" ? sessionUser.id : "";
    const sessionPublicUserId = typeof sessionUser?.userId === "string" ? sessionUser.userId : "";
    const sessionDisplayName = typeof sessionUser?.name === "string" ? sessionUser.name : "";
    const sessionEmail = typeof sessionUser?.email === "string" ? sessionUser.email : "";
    const sessionImage = typeof sessionUser?.image === "string" ? sessionUser.image : null;
    const myPageHref = useMyPageHref();

    const { language, t } = useLanguage();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [products, setProducts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [overlayOpen, setOverlayOpen] = useState(false);
    const [overlayPostId, setOverlayPostId] = useState<string | null>(null);
    const [overlayContent, setOverlayContent] = useState("");
    const [translatedContent, setTranslatedContent] = useState<string | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [translateTarget, setTranslateTarget] = useState<string>(language === 'ja' ? 'en' : 'ja');
    const [overlayMeta, setOverlayMeta] = useState<{
        date: string;
        createdAt: string;
        tags: string[];
        author: { id: string; userId?: string | null; name: string | null; email: string | null; image: string | null } | null;
        isProduct: boolean;
    }>({ date: "", createdAt: "", tags: [], author: null, isProduct: false });
    const [isPinned, setIsPinned] = useState(false);
    const [pinLoading, setPinLoading] = useState(false);
    const [activeSection, setActiveSection] = useState<SectionId>("home");

    // Blog pagination
    const BLOG_PER_PAGE = 7;
    const [blogPage, setBlogPage] = useState(0);

    const sectionsRef = useRef<HTMLElement[]>([]);
    const autoOpenedPostRef = useRef<string | null>(null);

    useEffect(() => {
        if (!session) return;
        router.prefetch(myPageHref);
        router.prefetch("/pins");
        router.prefetch("/messages");
        router.prefetch("/settings");
        router.prefetch("/editor");
    }, [myPageHref, router, session]);

    /* ─── Fetch user data ─── */
    useEffect(() => {
        async function loadUser() {
            const normalizedUserName = typeof userName === "string" ? userName.trim() : "";
            const normalizedSessionUserId = sessionUserId.trim();
            const normalizedSessionPublicUserId = sessionPublicUserId.trim();
            const normalizedSessionName = sessionDisplayName.trim().toLowerCase();
            const normalizedSessionEmail = sessionEmail.trim().toLowerCase();
            const ownRefs = new Set(
                [
                    normalizedSessionUserId.toLowerCase(),
                    normalizedSessionPublicUserId.toLowerCase(),
                    normalizedSessionName,
                    normalizedSessionEmail,
                ].filter(Boolean)
            );
            const isOwnRequestedPage =
                !!normalizedUserName && ownRefs.has(normalizedUserName.toLowerCase());

            const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

            const fetchJsonWithRetry = async (url: string, maxAttempts = 2) => {
                for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                    try {
                        const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok) {
                            return { ok: true as const, data, status: res.status };
                        }
                        if (res.status === 404) {
                            return { ok: false as const, data: null, status: res.status };
                        }
                        if (res.status >= 400 && res.status < 500) {
                            return { ok: false as const, data: null, status: res.status };
                        }
                    } catch {
                        // retry
                    }

                    if (attempt < maxAttempts - 1) {
                        await wait(150 * (attempt + 1));
                    }
                }

                return { ok: false as const, data: null, status: 0 };
            };

            const applyUserProfile = (data: UserProfile, cachedProfileForMerge?: UserProfile | null) => {
                const mergedProfile = mergeProfileWithCachedPosts(data, cachedProfileForMerge ?? null);
                setLoadError("");
                setUser(mergedProfile);
                const allPosts = mergedProfile.posts.map((p) => ({
                    ...p,
                    date: p.date || p.createdAt,
                    excerpt: p.excerpt || "",
                }));
                setPosts(allPosts.filter((p) => !p.tags?.includes("product")));
                setProducts(allPosts.filter((p) => p.tags?.includes("product")));
                writeCachedUserProfile(
                    mergedProfile,
                    normalizedUserName,
                    mergedProfile.id,
                    mergedProfile.userId || null,
                    mergedProfile.name || null,
                    mergedProfile.email || null
                );
            };

            const loadOwnProfileFallback = async (): Promise<UserProfile | null> => {
                if (!isOwnRequestedPage) {
                    return null;
                }

                const [settingsResult, myPostsResult] = await Promise.all([
                    fetchJsonWithRetry("/api/user/settings", 2),
                    fetchJsonWithRetry("/api/posts/my", 2),
                ]);

                if (!settingsResult.ok || !settingsResult.data || typeof settingsResult.data !== "object") {
                    return null;
                }

                const settings = settingsResult.data as Record<string, any>;
                const fallbackPosts = Array.isArray(myPostsResult.data) ? (myPostsResult.data as Post[]) : [];

                return {
                    id: String(settings.id || normalizedSessionUserId || normalizedUserName),
                    userId:
                        typeof settings.userId === "string"
                            ? settings.userId
                            : normalizedSessionPublicUserId || String(settings.id || normalizedSessionUserId || normalizedUserName),
                    name: String(settings.name || sessionDisplayName || ""),
                    email: String(settings.email || sessionEmail || ""),
                    image: typeof settings.image === "string" ? settings.image : sessionImage,
                    headerImage: typeof settings.headerImage === "string" ? settings.headerImage : null,
                    bio: String(settings.bio || ""),
                    aboutMe: String(settings.aboutMe || ""),
                    links: Array.isArray(settings.links) ? settings.links : [],
                    dmSetting:
                        settings.dmSetting === "OPEN" || settings.dmSetting === "PR_ONLY" || settings.dmSetting === "CLOSED"
                            ? settings.dmSetting
                            : "OPEN",
                    posts: fallbackPosts,
                };
            };

            const loadPublicProfile = async (maxAttempts: number) => {
                let result = await fetchJsonWithRetry(`/api/user/${encodeURIComponent(userName)}`, maxAttempts);
                if (
                    !result.ok &&
                    normalizedSessionUserId &&
                    normalizedSessionPublicUserId &&
                    normalizedSessionPublicUserId === normalizedUserName
                ) {
                    result = await fetchJsonWithRetry(`/api/user/${encodeURIComponent(normalizedSessionUserId)}`, maxAttempts);
                }
                return result;
            };

            const cachedProfile = readCachedUserProfile(
                normalizedUserName,
                normalizedSessionPublicUserId,
                normalizedSessionUserId,
                normalizedSessionName,
                normalizedSessionEmail
            );

            setLoadError("");
            if (cachedProfile) {
                applyUserProfile(cachedProfile, cachedProfile);
                setLoading(false);
            } else {
                setLoading(true);
                setUser(null);
                setPosts([]);
                setProducts([]);
            }

            try {
                const ownProfile = isOwnRequestedPage ? await loadOwnProfileFallback() : null;
                if (ownProfile) {
                    applyUserProfile(ownProfile, cachedProfile);
                    setLoading(false);
                }

                const result = await loadPublicProfile(cachedProfile || ownProfile ? 1 : 2);
                if (result.ok && result.data) {
                    applyUserProfile(result.data as UserProfile, ownProfile || cachedProfile);
                    setLoading(false);
                    return;
                }

                if (ownProfile || cachedProfile) {
                    setLoading(false);
                    return;
                }

                if (result.status !== 404) {
                    setLoadError("profile-load");
                } else {
                    setLoadError("");
                }
            } catch (e) {
                console.warn("Failed to load user:", e);
                if (!cachedProfile) {
                    setLoadError("profile-load");
                }
            } finally {
                setLoading(false);
            }
        }
        if (userName) loadUser();
    }, [sessionDisplayName, sessionEmail, sessionImage, sessionPublicUserId, sessionUserId, userName]);

    useEffect(() => {
        const canonicalUserId = typeof user?.userId === "string" ? user.userId.trim() : "";
        const requestedUserRef = typeof userName === "string" ? userName.trim() : "";

        if (!canonicalUserId || !requestedUserRef) {
            return;
        }

        if (requestedUserRef.toLowerCase() === canonicalUserId.toLowerCase()) {
            return;
        }

        const postPathSuffix = requestedPostIdProp ? `/posts/${encodeURIComponent(requestedPostIdProp)}` : "";
        const nextHref = `/user/${encodeURIComponent(canonicalUserId)}${postPathSuffix}${searchParamsString ? `?${searchParamsString}` : ""
            }`;
        router.replace(nextHref);
    }, [requestedPostIdProp, router, searchParamsString, user?.userId, userName]);

    useEffect(() => {
        async function loadPinState() {
            if (!session?.user || !user?.id) {
                setIsPinned(false);
                return;
            }
            const myId = (session.user as { id?: string }).id;
            if (myId && myId === user.id) {
                setIsPinned(false);
                return;
            }

            try {
                const res = await fetch(`/api/pins?userId=${encodeURIComponent(user.id)}`);
                const payload = await res.json().catch(() => ({} as { pinned?: boolean }));
                if (res.ok) {
                    setIsPinned(!!payload.pinned);
                }
            } catch {
                // ignore pin state fetch errors
            }
        }

        void loadPinState();
    }, [session?.user, user?.id]);

    /* ─── Scroll tracking ─── */
    const SECTIONS: SectionId[] = ["home", "blog", "product", "about"];

    const updateNav = useCallback(() => {
        const probeY = window.innerWidth <= 640 ? window.innerHeight * 0.34 : window.innerHeight * 0.28;
        let cur: SectionId = "home";
        for (const id of SECTIONS) {
            const el = document.getElementById(id);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (rect.top <= probeY && rect.bottom >= probeY) {
                cur = id;
                break;
            }
            if (rect.top <= probeY) {
                cur = id;
            }
        }
        setActiveSection((current) => (current === cur ? current : cur));
        const nb = document.getElementById("navbar");
        if (nb) nb.classList.toggle("scrolled", window.scrollY > 10);
    }, []);

    useEffect(() => {
        window.addEventListener("scroll", updateNav, { passive: true });
        updateNav();
        return () => window.removeEventListener("scroll", updateNav);
    }, [updateNav]);

    /* ─── Intersection Observer ─── */
    useEffect(() => {
        const obs = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("visible");
                        requestAnimationFrame(() => {
                            const items = entry.target.querySelectorAll(".fade-item:not(.show)");
                            items.forEach((el, i) => {
                                setTimeout(() => el.classList.add("show"), i * 70);
                            });
                        });
                    }
                });
            },
            { threshold: 0.08 }
        );
        sectionsRef.current.forEach((s) => { if (s) obs.observe(s); });
        return () => obs.disconnect();
    }, [posts, products, user]);

    /* ─── Overlay ─── */
    const openPostOverlay = (post: Post) => {
        setOverlayMeta({
            date: fmtDate(post.date || post.createdAt),
            createdAt: post.createdAt || "",
            tags: post.tags || [],
            author: user
                ? {
                    id: user.id,
                    userId: user.userId || null,
                    name: user.name || null,
                    email: user.email || null,
                    image: user.image || null,
                }
                : null,
            isProduct: !!post.tags?.includes("product"),
        });
        setOverlayPostId(post.id);
        setOverlayOpen(true);
        document.body.style.overflow = "hidden";
        setOverlayContent(post.content || "<p style='color:var(--text-soft)'>記事の内容がありません。</p>");
        setTranslatedContent(null);
    };

    const navigateToPost = (post: Post) => {
        const authorRef =
            (typeof user?.userId === "string" && user.userId.trim()) ||
            (typeof user?.id === "string" && user.id.trim()) ||
            userName;

        if (!authorRef) {
            openPostOverlay(post);
            return;
        }

        const href = buildUserPostPath(authorRef, post.id);
        rememberPostReturnPath(href, `${window.location.pathname}${window.location.search}`);
        router.push(href, { scroll: false });
    };

    const closeOverlay = () => {
        setOverlayOpen(false);
        setOverlayPostId(null);
        document.body.style.overflow = "";

        if (!requestedPostId) {
            return;
        }

        const authorRef =
            (typeof user?.userId === "string" && user.userId.trim()) ||
            (typeof user?.id === "string" && user.id.trim()) ||
            userName;
        const currentPostPath = buildUserPostPath(authorRef, requestedPostId);
        const returnPath = consumePostReturnPath(currentPostPath);
        router.push(returnPath || buildUserProfilePath(authorRef), { scroll: false });
    };

    const handleTranslate = async () => {
        if (translatedContent) {
            setTranslatedContent(null); // revert
            return;
        }
        setIsTranslating(true);
        try {
            const res = await fetch('/api/translate', {
                method: 'POST',
                body: JSON.stringify({ text: overlayContent, targetLang: translateTarget }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.translatedText) {
                const langName = translateTarget === 'en' ? 'English' : translateTarget === 'zh' ? '中文' : '日本語';
                setTranslatedContent(`<div style="padding:10px; background:var(--bg-soft); margin-bottom:16px; border-radius:6px; font-size:12px; color:var(--text-soft)">[Translated to ${langName}]</div>` + data.translatedText);
            } else {
                alert(t("翻訳に失敗しました"));
            }
        } catch (e) {
            alert(t("翻訳エラーが発生しました"));
            console.error(e);
        }
        setIsTranslating(false);
    };

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeOverlay(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, []);

    useEffect(() => {
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

    useEffect(() => {
        if (!requestedPostId) {
            autoOpenedPostRef.current = null;
            return;
        }
        if (!user) return;
        if (autoOpenedPostRef.current === requestedPostId) return;

        const target = [...posts, ...products].find((post) => post.id === requestedPostId);
        if (!target) return;

        autoOpenedPostRef.current = requestedPostId;
        openPostOverlay(target);
    }, [requestedPostId, user, posts, products]);

    /* ─── Computed ─── */
    const blogTotalPages = Math.ceil(posts.length / BLOG_PER_PAGE);
    const blogItems = posts.slice(blogPage * BLOG_PER_PAGE, (blogPage + 1) * BLOG_PER_PAGE);
    // おすすめの抽出
    const recommendProducts = products.slice(0, 2);

    const pinnedBlogs = posts.filter((p: any) => p.pinned);
    const recommendBlogs = pinnedBlogs.slice(0, 3);

    const scrollTo = (id: string) => {
        const el = document.getElementById(id);
        if (!el) return;
        const offset = window.innerWidth <= 640 ? 156 : 120;
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    };

    const togglePinUser = async () => {
        if (!session?.user || !user?.id || pinLoading) return;
        const myId = (session.user as { id?: string }).id;
        if (myId && myId === user.id) return;

        if (isPinned && !confirm("このユーザーのピンを外しますか？")) {
            return;
        }

        setPinLoading(true);
        try {
            const res = isPinned
                ? await fetch(`/api/pins?userId=${encodeURIComponent(user.id)}`, { method: "DELETE" })
                : await fetch("/api/pins", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: user.id }),
                });

            if (res.ok) {
                setIsPinned(!isPinned);
            }
        } finally {
            setPinLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="login-container">
                <div className="login-card" style={{ textAlign: "center" }}>
                    <p style={{ color: "var(--text-soft)" }}>読み込み中...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        if (loadError) {
            return (
                <div className="login-container">
                    <div className="login-card" style={{ textAlign: "center" }}>
                        <h2 style={{ fontFamily: "var(--serif)", marginBottom: 16 }}>プロフィールの読み込みに失敗しました</h2>
                        <p style={{ color: "var(--text-soft)", marginBottom: 16 }}>
                            時間をおいて再読み込みしてください。
                        </p>
                        <Link href="/" style={{ color: "var(--azuki)" }}>ホームに戻る</Link>
                    </div>
                </div>
            );
        }

        return (
            <div className="login-container">
                <div className="login-card" style={{ textAlign: "center" }}>
                    <h2 style={{ fontFamily: "var(--serif)", marginBottom: 16 }}>ユーザーが見つかりません</h2>
                    <Link href="/" style={{ color: "var(--azuki)" }}>ホームに戻る</Link>
                </div>
            </div>
        );
    }

    const displayName = user.name || userName;
    const isOwnProfile = !!session?.user && (session.user as { id?: string }).id === user.id;
    const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null;
    const canShowAboutDmButton = !isOwnProfile && (user.dmSetting || "OPEN") === "OPEN";
    const canShowPinButton = !!session?.user && !isOwnProfile;
    const renderedOverlayContent = prepareRenderedPostHtml(translatedContent || overlayContent, {
        isProduct: overlayMeta.isProduct,
        createdAt: overlayMeta.createdAt,
    });
    const renderProfileSectionTabs = (keyPrefix: string) =>
        SECTION_TABS.map((tab) => {
            const isActive = activeSection === tab.id;
            return (
                <button
                    key={`${keyPrefix}-${tab.id}`}
                    className={`nav-link profile-tab-btn ${isActive ? "active" : ""}`}
                    data-section={tab.id}
                    onClick={() => scrollTo(tab.id)}
                    aria-label={tab.label}
                    title={tab.label}
                >
                    <SectionTabIcon section={tab.id} />
                    {isActive ? <span className="profile-tab-label">{tab.label}</span> : null}
                </button>
            );
        });

    return (
        <>
            {/* ─── Navbar ─── */}
            <nav className="navbar profile-navbar" id="navbar">
                <div className="profile-navbar-brand">
                    <Link
                        href="/"
                        className="nav-logo"
                        style={{ textDecoration: "none", position: "static", left: "auto" }}
                    >
                        <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                        Next Blog <span className="beta-badge">β</span>
                    </Link>
                    {session && isOwnProfile ? (
                        <Link
                            href="/pins"
                            className="nav-auth-btn nav-user-btn home-navbar-pin-btn"
                            style={{ textDecoration: "none" }}
                            title="ピンしたユーザーの新着"
                        >
                            👥
                        </Link>
                    ) : null}
                </div>
                <div className="profile-navbar-tabs">
                    {renderProfileSectionTabs("desktop")}
                </div>
                <div className="nav-auth profile-navbar-actions">
                    {session ? (
                        <>
                            {canShowPinButton && (
                                <button
                                    type="button"
                                    className="nav-auth-btn nav-user-btn"
                                    onClick={() => void togglePinUser()}
                                    disabled={pinLoading}
                                    title={isPinned ? "ピンを外す" : "ピンする"}
                                    style={
                                        isPinned
                                            ? {
                                                background: "color-mix(in srgb, var(--azuki) 14%, transparent)",
                                                borderColor: "color-mix(in srgb, var(--azuki) 35%, transparent)",
                                                color: "var(--azuki-deep)",
                                            }
                                            : undefined
                                    }
                                >
                                    {pinLoading ? "..." : "📌"}
                                </button>
                            )}
                            <Link href="/editor" className="nav-auth-btn nav-write-btn" title="記事を書く">✍️</Link>
                            <Link href={myPageHref} className="nav-auth-btn nav-user-btn" title="マイページ">
                                👤
                            </Link>
                            <Link href="/settings" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>⚙</Link>
                            <UnreadDmButton className="nav-auth-btn nav-user-btn" />
                        </>
                    ) : (
                        <Link href="/login" className="nav-auth-btn nav-login-btn">ログイン</Link>
                    )}
                </div>
            </nav>

            <div className="profile-mobile-tabs">
                <div className="profile-mobile-tabs-track">
                    {renderProfileSectionTabs("mobile")}
                </div>
            </div>

            {/* ─── Page dots ─── */}
            <div className="page-dots" id="pageDots">
                {SECTIONS.map((s) => (
                    <div key={s} className={`page-dot ${activeSection === s ? "active" : ""}`} style={{ width: activeSection === s ? 20 : 6 }} data-section={s} />
                ))}
            </div>

            {/* ─── Main content ─── */}
            <div className="main-content profile-main-content">

                {/* ──── HOME ──── */}
                <section className="section visible" id="home" ref={(el) => { if (el) sectionsRef.current[0] = el; }}>
                    <div className="hero">
                        <div className="hero-bg" style={user.headerImage ? { backgroundImage: `url(${user.headerImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} />
                        <div className="hero-content" style={user.headerImage ? { position: "relative", zIndex: 1 } : undefined}>
                            <h1 style={user.headerImage ? { color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.7)" } : undefined}>{displayName} Blog</h1>
                            <p style={user.headerImage ? { color: "#eee", textShadow: "0 1px 5px rgba(0,0,0,0.7)" } : undefined}>{user.bio || "学び、作り、考える。日々の記録。"}</p>
                        </div>
                    </div>
                    {(recommendProducts.length > 0 || recommendBlogs.length > 0) && (
                        <>
                            <h2 className="section-title fade-item">おすすめ</h2>

                            {recommendProducts.length > 0 && (
                                <div className="recommend-grid">
                                    {recommendProducts.map((p: any) => (
                                        <div key={p.id} className="product-card fade-item" onClick={() => navigateToPost(p)}>
                                            {p.headerImage ? (
                                                <img src={p.headerImage} alt={p.title} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 10, marginBottom: 8 }} />
                                            ) : (
                                                <div
                                                    className="product-thumb"
                                                    style={{
                                                        height: 120,
                                                        background:
                                                            "linear-gradient(135deg, var(--azuki-pale), color-mix(in srgb, var(--azuki-pale) 54%, transparent))",
                                                    }}
                                                >
                                                    <div className="product-thumb-inner" />
                                                </div>
                                            )}
                                            <div className="product-info">
                                                <h3 style={{ fontSize: 16 }}>{p.title}</h3>
                                                {p.excerpt ? (
                                                    <p style={{ fontSize: 13 }}>{p.excerpt}</p>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {recommendBlogs.length > 0 && (
                                <div className="recommend-row">
                                    {recommendBlogs.map((p: any) => (
                                        <div key={p.id} className="card card-sm fade-item" style={{ padding: 18 }} onClick={() => navigateToPost(p)}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                                                <h4 style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5, margin: 0 }}>{p.title}</h4>
                                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                                    {(p.tags || []).filter((t: any) => t !== "product").map((t: any) => <Tag key={t} label={t} />)}
                                                </div>
                                            </div>
                                            <p style={{ fontSize: 12, color: "var(--azuki-light)" }}>{fmtDate(p.date || p.createdAt)}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </section>

                <div className="section-divider" />

                {/* ──── BLOG ──── */}
                <section className="section" id="blog" ref={(el) => { if (el) sectionsRef.current[1] = el; }}>
                    <h2 className="section-title">Blog</h2>
                    {posts.length === 0 ? (
                        <p style={{ textAlign: "center", color: "var(--text-soft)", padding: "40px 0" }}>まだ記事がありません。</p>
                    ) : (
                        <div className="blog-list">
                            {blogItems.map((p, i) => (
                                <div key={p.id} className="blog-item fade-item" style={{ transitionDelay: `${i * 60}ms` }} onClick={() => navigateToPost(p)}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                                            <h3 style={{ margin: 0 }}>{p.title}</h3>
                                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                                {(p.tags || []).filter(t => t !== "product").map((t) => <Tag key={t} label={t} />)}
                                            </div>
                                        </div>
                                        <p>{p.excerpt}</p>
                                    </div>
                                    <div className="blog-date">{fmtDate(p.date || p.createdAt)}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    {blogTotalPages > 1 && (
                        <div className="pagination">
                            <button className="page-btn" onClick={() => setBlogPage(Math.max(0, blogPage - 1))} disabled={blogPage === 0}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                            </button>
                            <span className="page-info">{blogPage + 1} / {blogTotalPages}</span>
                            <button className="page-btn" onClick={() => setBlogPage(Math.min(blogTotalPages - 1, blogPage + 1))} disabled={blogPage === blogTotalPages - 1}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                            </button>
                        </div>
                    )}
                </section>

                <div className="section-divider" />

                {/* ──── PRODUCT ──── */}
                <section className="section" id="product" ref={(el) => { if (el) sectionsRef.current[2] = el; }}>
                    <h2 className="section-title">Product</h2>
                    {products.length === 0 ? (
                        <p style={{ textAlign: "center", color: "var(--text-soft)", padding: "40px 0" }}>まだプロダクトがありません。</p>
                    ) : (
                        <div className="product-grid">
                            {products.map((p) => (
                                <div key={p.id} className="product-card fade-item" onClick={() => navigateToPost(p)}>
                                    {p.headerImage ? (
                                        <img src={p.headerImage} alt={p.title} style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 10, marginBottom: 8 }} />
                                    ) : (
                                        <div
                                            className="product-thumb"
                                            style={{
                                                background:
                                                    "linear-gradient(135deg, var(--azuki-pale), color-mix(in srgb, var(--azuki-pale) 54%, transparent))",
                                            }}
                                        >
                                            <div className="product-thumb-inner" />
                                        </div>
                                    )}
                                    <div className="product-info">
                                        <h3>{p.title}</h3>
                                        <p>{p.excerpt}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <div className="section-divider" />

                {/* ──── ABOUT ──── */}
                <section className="section" id="about" ref={(el) => { if (el) sectionsRef.current[3] = el; }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                        <h2 className="section-title" style={{ marginBottom: 0 }}>About me</h2>
                        {canShowAboutDmButton && (
                            <UnreadDmButton
                                href={`/messages?to=${encodeURIComponent(user.id)}`}
                                className="nav-auth-btn nav-user-btn"
                                style={{ fontSize: 12, padding: "4px 10px" }}
                                title="DM"
                            />
                        )}
                    </div>
                    <div className="about-header">
                        <div className="about-avatar" style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--bg-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "var(--azuki)", overflow: "hidden", border: "1px solid var(--border)" }}>
                            {user.image ? (
                                <img src={user.image} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                                displayName.charAt(0).toUpperCase()
                            )}
                        </div>
                        <div>
                            <h3 className="about-name">{displayName}</h3>
                        </div>
                    </div>
                    {user.aboutMe && (
                        <div className="about-bio" style={{ whiteSpace: "pre-wrap" }}>
                            <p>{user.aboutMe}</p>
                        </div>
                    )}

                    {/* SNS / Contact Links */}
                    {user.links && user.links.length > 0 && (
                        <div className="contact-section" style={{ marginTop: 32 }}>
                            <h3 className="contact-title">Links</h3>
                            <div className="contact-links">
                                {user.links.map((link, i) => {
                                    const isEmail = link.label.toLowerCase() === "email" || link.label === "メール";
                                    const rawUrl = isEmail && !link.url.startsWith("mailto:") ? `mailto:${link.url}` : link.url;
                                    const displayUrl = link.url.replace(/^https?:\/\//, "").replace(/^mailto:/, "");

                                    return (
                                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                            <a href={rawUrl} target="_blank" rel="noopener noreferrer" className="contact-link" style={{ flex: 1, marginBottom: 0 }}>
                                                <div className="contact-link-inner">
                                                    <div
                                                        className="contact-icon"
                                                        style={{
                                                            background: "color-mix(in srgb, var(--azuki) 8%, transparent)",
                                                            color: "var(--azuki)",
                                                        }}
                                                    >
                                                        {link.label.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="contact-name">{link.label}</div>
                                                        <div className="contact-handle">{displayUrl}</div>
                                                    </div>
                                                </div>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--azuki-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                                            </a>
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    navigator.clipboard.writeText(isEmail ? displayUrl : link.url);
                                                    alert(t("リンクをコピーしました"));
                                                }}
                                                className="editor-btn editor-btn-secondary"
                                                style={{ height: "100%", padding: "0 12px", border: "1px solid var(--border)", background: "var(--bg-card)", cursor: "pointer", borderRadius: 12, display: "flex", alignItems: "center" }}
                                                title="リンクをコピー"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--azuki)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                </section>
            </div>

            {/* ─── Footer ─── */}
            <footer className="footer">
                <div className="footer-links">
                    <span className="footer-copy">© 2026 Next Blog</span>
                    {session ? (
                        <Link href="/terms" className="footer-link">
                            利用規約
                        </Link>
                    ) : null}
                </div>
            </footer>

            {/* ─── Overlay ─── */}
            <div className={`post-overlay ${overlayOpen ? "open" : ""}`} onClick={closeOverlay}>
                <div className={`post-panel ${overlayMeta.isProduct ? "product-post-panel" : ""}`} onClick={(e) => e.stopPropagation()}>
                    <div className="post-panel-header">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {overlayMeta.author?.id && (
                                <Link
                                    href={`/user/${encodeURIComponent(overlayMeta.author.userId || overlayMeta.author.id)}`}
                                    style={{ textDecoration: "none" }}
                                    title="ページに飛ぶ"
                                >
                                    <div
                                        style={{
                                            width: 24,
                                            height: 24,
                                            borderRadius: "50%",
                                            border: "1px solid var(--border)",
                                            background: "var(--bg-soft)",
                                            color: "var(--azuki)",
                                            overflow: "hidden",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 11,
                                            fontWeight: 600,
                                        }}
                                    >
                                        {overlayMeta.author.image ? (
                                            <img
                                                src={overlayMeta.author.image}
                                                alt={overlayMeta.author.name || "author"}
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                            />
                                        ) : (
                                            (overlayMeta.author.name || overlayMeta.author.email || "A").charAt(0).toUpperCase()
                                        )}
                                    </div>
                                </Link>
                            )}
                            <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{overlayMeta.date}</span>
                        </div>
                        <button className="post-close-btn" onClick={closeOverlay}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    </div>
                    <div className="post-panel-body">
                        <div className="post-meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                                {overlayMeta.tags.filter(t => t !== "product").map((t) => <Tag key={t} label={t} />)}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <select
                                    value={translateTarget}
                                    onChange={(e) => setTranslateTarget(e.target.value)}
                                    style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-soft)", fontSize: 11, padding: "2px 4px", borderRadius: 4 }}
                                >
                                    <option value="ja">日本語</option>
                                    <option value="en">English</option>
                                    <option value="zh">中文</option>
                                </select>
                                <button
                                    className="editor-btn editor-btn-secondary"
                                    onClick={handleTranslate}
                                    disabled={isTranslating}
                                    style={{ padding: "4px 8px", fontSize: 11, background: "transparent", border: "1px solid var(--border)" }}
                                >
                                    {isTranslating ? "..." : translatedContent ? "A文 revert" : "A文 translate"}
                                </button>
                            </div>
                        </div>
                        <div className="md-content" dangerouslySetInnerHTML={{ __html: renderedOverlayContent }} />
                        <PostComments
                            postId={overlayPostId}
                            isSignedIn={!!session?.user}
                            currentUserId={currentUserId}
                        />
                    </div>
                </div>
            </div>
        </>
    );
}

