"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import Link from "next/link";

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
    name: string;
    email: string;
    image?: string | null;
    headerImage?: string | null;
    bio: string;
    aboutMe: string;
    links: SocialLink[];
    posts: Post[];
}

/* ─── Tag colors ─── */
const TAG_COLORS: Record<string, string> = {
    "AI": "#d4877a", "思考": "#8a7a6b", "コード": "#6b7a8a",
    "3D": "#8a6b7a", "哲学": "#7a6b8a", "テクノロジー": "#d4877a",
    "社会": "#6b8a7a", "作品": "#7a8a6b", "ツール": "#6b8a8a",
    "デザイン": "#8a6b6b", "言語": "#6b6b8a",
};

function Tag({ label }: { label: string }) {
    const c = TAG_COLORS[label] || "#9b6b6b";
    return (
        <span className="tag" style={{ color: c, background: c + "18", border: `1px solid ${c}30` }}>
            {label}
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

export default function UserPage() {
    const { data: session } = useSession();
    const params = useParams();
    const userName = params.name as string;

    const [user, setUser] = useState<UserProfile | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [products, setProducts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [overlayOpen, setOverlayOpen] = useState(false);
    const [overlayContent, setOverlayContent] = useState("");
    const [overlayMeta, setOverlayMeta] = useState<{ date: string; tags: string[] }>({ date: "", tags: [] });

    // Blog pagination
    const BLOG_PER_PAGE = 7;
    const [blogPage, setBlogPage] = useState(0);

    const sectionsRef = useRef<HTMLElement[]>([]);

    /* ─── Fetch user data ─── */
    useEffect(() => {
        async function loadUser() {
            try {
                const res = await fetch(`/api/user/${userName}`);
                if (res.ok) {
                    const data: UserProfile = await res.json();
                    setUser(data);
                    const allPosts = data.posts.map((p) => ({
                        ...p,
                        date: p.date || p.createdAt,
                        excerpt: p.excerpt || (p.content ? p.content.replace(/<[^>]*>/g, "").substring(0, 100) + "..." : ""),
                    }));
                    setPosts(allPosts.filter((p) => !p.tags?.includes("product")));
                    setProducts(allPosts.filter((p) => p.tags?.includes("product")));
                }
            } catch (e) {
                console.warn("Failed to load user:", e);
            } finally {
                setLoading(false);
            }
        }
        if (userName) loadUser();
    }, [userName]);

    /* ─── Scroll tracking ─── */
    const SECTIONS = ["home", "blog", "product", "about"];

    const updateNav = useCallback(() => {
        const sy = window.scrollY + 120;
        let cur = "home";
        SECTIONS.forEach((id) => {
            const el = document.getElementById(id);
            if (el && el.offsetTop <= sy) cur = id;
        });
        document.querySelectorAll(".nav-link").forEach((link) => {
            const el = link as HTMLElement;
            el.classList.toggle("active", el.dataset.section === cur);
        });
        document.querySelectorAll(".page-dot").forEach((dot) => {
            const el = dot as HTMLElement;
            const isActive = el.dataset.section === cur;
            el.classList.toggle("active", isActive);
            el.style.width = isActive ? "20px" : "6px";
        });
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
    const openPost = (post: Post) => {
        setOverlayMeta({ date: fmtDate(post.date || post.createdAt), tags: post.tags || [] });
        setOverlayOpen(true);
        document.body.style.overflow = "hidden";
        setOverlayContent(post.content || "<p style='color:var(--text-soft)'>記事の内容がありません。</p>");
    };

    const closeOverlay = () => {
        setOverlayOpen(false);
        document.body.style.overflow = "";
    };

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeOverlay(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, []);

    /* ─── Computed ─── */
    const blogTotalPages = Math.ceil(posts.length / BLOG_PER_PAGE);
    const blogItems = posts.slice(blogPage * BLOG_PER_PAGE, (blogPage + 1) * BLOG_PER_PAGE);

    // おすすめの抽出
    const pinnedProducts = products.filter((p: any) => p.pinned).slice(0, 2);
    const pinnedBlogs = posts.filter((p: any) => p.pinned).slice(0, 3);
    let recommendPosts = [...pinnedProducts, ...pinnedBlogs];

    // まだピン留めがない場合は、新しい順で自動設定
    if (recommendPosts.length === 0) {
        recommendPosts = [...products.slice(0, 2), ...posts.slice(0, 3)];
    }

    const scrollTo = (id: string) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth" });
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

    return (
        <>
            {/* ─── Navbar ─── */}
            <nav className="navbar" id="navbar">
                <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>
                    <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                    Next Blog
                </Link>
                <div className="nav-links">
                    <button className="nav-link active" data-section="home" onClick={() => scrollTo("home")}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                        Home
                    </button>
                    <button className="nav-link" data-section="blog" onClick={() => scrollTo("blog")}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                        Blog
                    </button>
                    <button className="nav-link" data-section="product" onClick={() => scrollTo("product")}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                        Product
                    </button>
                    <button className="nav-link" data-section="about" onClick={() => scrollTo("about")}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        About me
                    </button>
                </div>
                <div className="nav-auth">
                    {session ? (
                        <>
                            <Link href="/editor" className="nav-auth-btn nav-write-btn">✏ 記事を書く</Link>
                            <Link href="/settings" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>⚙</Link>
                        </>
                    ) : (
                        <Link href="/login" className="nav-auth-btn nav-login-btn">ログイン</Link>
                    )}
                </div>
            </nav>

            {/* ─── Page dots ─── */}
            <div className="page-dots" id="pageDots">
                {SECTIONS.map((s) => (
                    <div key={s} className={`page-dot ${s === "home" ? "active" : ""}`} style={{ width: s === "home" ? 20 : 6 }} data-section={s} />
                ))}
            </div>

            {/* ─── Main content ─── */}
            <div className="main-content">

                {/* ──── HOME ──── */}
                <section className="section visible" id="home" ref={(el) => { if (el) sectionsRef.current[0] = el; }}>
                    <div className="hero">
                        <div className="hero-bg" style={user.headerImage ? { backgroundImage: `url(${user.headerImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} />
                        <div className="hero-content" style={user.headerImage ? { position: "relative", zIndex: 1 } : undefined}>
                            <h1 style={user.headerImage ? { color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.7)" } : undefined}>{displayName} Blog</h1>
                            <p style={user.headerImage ? { color: "#eee", textShadow: "0 1px 5px rgba(0,0,0,0.7)" } : undefined}>{user.bio || "学び、作り、考える。日々の記録。"}</p>
                        </div>
                    </div>
                    {recommendPosts.length > 0 && (
                        <>
                            <h2 className="section-title fade-item">おすすめ</h2>
                            <div className="recommend-row">
                                {recommendPosts.map((p: any) => (
                                    <div key={p.id} className="card card-sm fade-item" style={{ padding: 18 }} onClick={() => openPost(p)}>
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
                                <div key={p.id} className="blog-item fade-item" style={{ transitionDelay: `${i * 60}ms` }} onClick={() => openPost(p)}>
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
                                <div key={p.id} className="product-card fade-item" onClick={() => openPost(p)}>
                                    {p.headerImage ? (
                                        <img src={p.headerImage} alt={p.title} style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 10, marginBottom: 8 }} />
                                    ) : (
                                        <div className="product-thumb" style={{ background: "linear-gradient(135deg,#e8d5d0,#e8d5d088)" }}>
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
                    <h2 className="section-title">About me</h2>
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
                                                    <div className="contact-icon" style={{ background: "rgba(155,107,107,0.08)", color: "var(--azuki)" }}>
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
                                                    alert(`${link.label} のリンクをコピーしました！`);
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
                <span className="footer-copy">© 2026 Next Blog</span>
            </footer>

            {/* ─── Overlay ─── */}
            <div className={`post-overlay ${overlayOpen ? "open" : ""}`} onClick={closeOverlay}>
                <div className="post-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="post-panel-header">
                        <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{overlayMeta.date}</span>
                        <button className="post-close-btn" onClick={closeOverlay}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    </div>
                    <div className="post-panel-body">
                        <div className="post-meta">
                            {overlayMeta.tags.filter(t => t !== "product").map((t) => <Tag key={t} label={t} />)}
                        </div>
                        <div className="md-content" dangerouslySetInnerHTML={{ __html: overlayContent }} />
                    </div>
                </div>
            </div>
        </>
    );
}
