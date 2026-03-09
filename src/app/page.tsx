/* eslint-disable */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import PostComments from "@/components/PostComments";
import UnreadDmButton from "@/components/UnreadDmButton";
import HomeShortPosts from "@/components/HomeShortPosts";
import { useMyPageHref } from "@/hooks/useMyPageHref";
import { prepareRenderedPostHtml } from "@/lib/postContent";
import { readSessionCache, writeSessionCache } from "@/lib/clientSessionCache";

interface Post {
  id: string;
  title: string;
  content?: string;
  excerpt?: string;
  tags: string[];
  createdAt: string;
  author?: { id: string; userId?: string | null; name: string | null; email: string | null; image?: string | null };
}

const TAG_COLORS: Record<string, string> = {
  "AI": "#d4877a", "思考": "#8a7a6b", "コード": "#6b7a8a",
  "3D": "#8a6b7a", "哲学": "#7a6b8a", "テクノロジー": "#d4877a",
  "社会": "#6b8a7a", "作品": "#7a8a6b", "ツール": "#6b8a8a",
};

const HOME_POSTS_CACHE_KEY = "home-posts-cache:v1";
const HOME_POSTS_CACHE_TTL_MS = 60 * 1000;

function renderTagLabel(tag: string): string {
  return tag === "ai-generated" ? "AIで作成" : tag;
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

export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { t, language } = useLanguage();
  const myPageHref = useMyPageHref();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayPostId, setOverlayPostId] = useState<string | null>(null);
  const [overlayContent, setOverlayContent] = useState("");
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateTarget, setTranslateTarget] = useState<string>(language === 'ja' ? 'en' : 'ja');
  const [overlayMeta, setOverlayMeta] = useState({
    date: "",
    createdAt: "",
    tags: [] as string[],
    author: null as Post["author"] | null,
    isProduct: false,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [postsError, setPostsError] = useState("");

  useEffect(() => {
    let active = true;
    const cachedPosts = readSessionCache<Post[]>(HOME_POSTS_CACHE_KEY, HOME_POSTS_CACHE_TTL_MS);
    if (cachedPosts && cachedPosts.length > 0) {
      setPosts(cachedPosts);
      setLoadingPosts(false);
      setPostsError("");
    }

    const loadPosts = async (attempt = 0): Promise<void> => {
      if (!cachedPosts || cachedPosts.length === 0) {
        setPostsError("");
      }
      try {
        const res = await fetch("/api/posts");
        const data = await res.json().catch(() => []);
        if (!res.ok || !Array.isArray(data)) {
          if (res.status >= 400 && res.status < 500) {
            throw new Error("Failed to fetch posts");
          }
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 350));
            await loadPosts(attempt + 1);
            return;
          }
          throw new Error("Failed to fetch posts");
        }
        if (!active) return;
        const nextPosts = data.map((p: Post) => ({
          ...p,
          excerpt: p.excerpt || "",
        }));
        setPosts(nextPosts);
        writeSessionCache(HOME_POSTS_CACHE_KEY, nextPosts);
        setPostsError("");
      } catch (error) {
        if (!active) return;
        console.error(error);
        if (!cachedPosts || cachedPosts.length === 0) {
          setPosts([]);
          setPostsError("記事の読み込みに失敗しました。時間をおいて再読み込みしてください。");
        }
      } finally {
        if (active) setLoadingPosts(false);
      }
    };

    void loadPosts();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    router.prefetch(myPageHref);
    router.prefetch("/pins");
    router.prefetch("/messages");
    router.prefetch("/settings");
    router.prefetch("/editor");
  }, [myPageHref, router, session]);

  const openPost = (post: Post) => {
    setOverlayMeta({
      date: fmtDate(post.createdAt),
      createdAt: post.createdAt || "",
      tags: post.tags || [],
      author: post.author || null,
      isProduct: !!post.tags?.includes("product"),
    });
    setOverlayPostId(post.id);
    setOverlayContent(post.content || "<p>記事の内容がありません。</p>");
    setTranslatedContent(null);
    setOverlayOpen(true);
    document.body.style.overflow = "hidden";
  };

  const closeOverlay = () => {
    setOverlayOpen(false);
    setOverlayPostId(null);
    document.body.style.overflow = "";
  };

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeOverlay(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const blogPosts = posts.filter((p) => !p.tags?.includes("product"));
  const productPosts = posts.filter((p) => p.tags?.includes("product"));
  const renderedOverlayContent = prepareRenderedPostHtml(translatedContent || overlayContent, {
    isProduct: overlayMeta.isProduct,
    createdAt: overlayMeta.createdAt,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/user/${encodeURIComponent(searchQuery.trim())}`);
    }
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

  const sessionUser = session?.user as { id?: string; userId?: string | null } | undefined;
  const currentUserId = sessionUser?.id ?? null;

  return (
    <>
      {/* ─── Navbar ─── */}
      <nav className="navbar home-navbar" id="navbar" style={{ justifyContent: "space-between" }}>
        <div className="home-navbar-brand">
          <Link href="/" className="nav-logo" style={{ textDecoration: "none", position: "static", left: "auto" }}>
            <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
            {t("Next Blog")} <span className="beta-badge">β</span>
          </Link>
          {session ? (
            <Link
              href="/pins"
              className="nav-auth-btn nav-user-btn home-navbar-pin-btn"
              style={{ textDecoration: "none", padding: "4px 10px", fontSize: 13 }}
              title="ピンしたユーザーの新着"
            >
              👥</Link>
          ) : null}
        </div>
        <div className="nav-auth home-navbar-actions">
          {session ? (
            <>
              <Link href="/editor" className="nav-auth-btn nav-write-btn" title="記事を書く">✍️</Link>
              <Link href={myPageHref} className="nav-auth-btn nav-user-btn" title="マイページ">
                👤
              </Link>
              <Link href="/settings" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>⚙</Link>
              <UnreadDmButton className="nav-auth-btn nav-user-btn" />
            </>
          ) : (
            <Link href="/login" className="nav-auth-btn nav-login-btn">{t("ログイン")}</Link>
          )
          }
        </div >
      </nav >

      {/* ─── Hero ─── */}
      < div className="main-content" >
        <section className="hero">
          <div className="hero-content">
            <h1 style={{
              fontFamily: "var(--serif)",
              fontSize: "clamp(32px, 5vw, 48px)",
              fontWeight: 300,
              color: "var(--azuki-deep)",
              marginBottom: 12,
              letterSpacing: "0.06em",
            }}>
              Next Blog
            </h1>
            <p style={{
              fontSize: 15,
              color: "var(--text-soft)",
              maxWidth: 420,
              margin: "0 auto",
              lineHeight: 1.8,
            }}>
              {t("思考と創造を共有するプラットフォーム。")}
            </p>

            <form onSubmit={handleSearch} style={{ marginTop: 32, display: "flex", justifyContent: "center", gap: 8 }}>
              <input
                type="text"
                placeholder={t("ユーザーを検索...")}
                className="login-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 280, marginBottom: 0, border: "1px solid var(--border)", background: "var(--bg-card)" }}
              />
              <button type="submit" className="editor-btn editor-btn-primary" style={{ padding: "0 24px" }}>
                {t("検索")}
              </button>
            </form>
          </div>
        </section>

        <HomeShortPosts />
        {
          postsError && (
            <div className="login-message login-error" style={{ marginBottom: 12 }}>
              {postsError}
            </div>
          )
        }

        <div className="section-divider" />

        {/* ─── Recent Blog Posts ─── */}
        <section className="section">
          <h2 className="section-title">{t("最近の記事")}</h2>
          {loadingPosts ? (
            <p style={{ textAlign: "center", color: "var(--text-soft)", padding: "40px 0" }}>
              {t("読み込み中...")}
            </p>
          ) : blogPosts.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-soft)", padding: "40px 0" }}>
              {t("まだ記事がありません。ログインして最初の記事を書きましょう。")}
            </p>
          ) : (
            <div className="blog-list">
              {blogPosts.slice(0, 10).map((p) => (
                <div key={p.id} className="blog-item" onClick={() => openPost(p)} style={{ cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0 }}>{p.title}</h3>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(p.tags || []).filter(t => t !== "product").map((t) => {
                          const c = TAG_COLORS[t] || "#9b6b6b";
                          return <span key={t} className="tag" style={{ color: c, background: c + "18", border: `1px solid ${c}30` }}>{renderTagLabel(t)}</span>;
                        })}
                      </div>
                    </div>
                    <p>{p.excerpt}</p>
                    <div style={{ fontSize: 12, color: "var(--azuki-light)", marginTop: 8 }}>
                      by{" "}
                      <Link
                        href={p.author?.userId ? `/user/${encodeURIComponent(p.author.userId)}` : "#"}
                        style={{ color: "var(--azuki)", textDecoration: "none" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.author?.name || "Anonymous"}
                      </Link>
                    </div>
                  </div>
                  <div className="blog-date">{fmtDate(p.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ─── Products ─── */}
        {
          productPosts.length > 0 && (
            <>
              <div className="section-divider" />
              <section className="section">
                <h2 className="section-title">{t("最近のプロダクト")}</h2>
                <div className="product-grid">
                  {productPosts.slice(0, 8).map((p) => (
                    <div key={p.id} className="product-card" onClick={() => openPost(p)} style={{ cursor: "pointer" }}>
                      <div className="product-thumb" style={{ background: "linear-gradient(135deg,#e8d5d0,#e8d5d088)" }}>
                        <div className="product-thumb-inner" />
                      </div>
                      <div className="product-info">
                        <h3>{p.title}</h3>
                        <p>{p.excerpt}</p>
                        <div style={{ fontSize: 11, color: "var(--azuki-light)", marginTop: 6 }}>
                          by {p.author?.name || "Anonymous"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )
        }
      </div >

      {/* ─── Footer ─── */}
      < footer className="footer" >
        <div className="footer-links">
          <span className="footer-copy">© 2026 Next Blog</span>
          {session ? (
            <Link href="/terms" className="footer-link">
              利用規約
            </Link>
          ) : null}
        </div>
      </footer >

      {/* ─── Overlay ─── */}
      < div className={`post-overlay ${overlayOpen ? "open" : ""}`} onClick={closeOverlay} >
        <div className={`post-panel ${overlayMeta.isProduct ? "product-post-panel" : ""}`} onClick={(e) => e.stopPropagation()}>
          <div className="post-panel-header">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {overlayMeta.author?.id && (
                <Link
                  href={overlayMeta.author.userId ? `/user/${encodeURIComponent(overlayMeta.author.userId)}` : "#"}
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
              {overlayMeta.author && (
                <span style={{ fontSize: 12, color: "var(--azuki-light)" }}>
                  by {overlayMeta.author.name || overlayMeta.author.email || "Anonymous"}
                </span>
              )}
            </div>
            <button className="post-close-btn" onClick={closeOverlay}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="post-panel-body">
            {overlayMeta.tags.length > 0 && (
              <div className="post-meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  {overlayMeta.tags.filter(t => t !== "product").map((t) => {
                    const c = TAG_COLORS[t] || "#9b6b6b";
                    return <span key={t} className="tag" style={{ color: c, background: c + "18", border: `1px solid ${c}30` }}>{renderTagLabel(t)}</span>;
                  })}
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
            )}
            <div className="md-content" dangerouslySetInnerHTML={{ __html: renderedOverlayContent }} />
            <PostComments
              postId={overlayPostId}
              isSignedIn={!!session?.user}
              currentUserId={currentUserId}
            />
          </div>
        </div>
      </div >
    </>
  );
}
