"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import PostComments from "@/components/PostComments";

interface Post {
    id: string;
    title: string;
    content?: string;
    excerpt?: string;
    tags: string[];
    createdAt: string;
    author?: { name: string | null; email: string | null };
}

const TAG_COLORS: Record<string, string> = {
    AI: "#d4877a",
    Tech: "#8a7a6b",
    Code: "#6b7a8a",
    Product: "#8a6b7a",
};

function fmtDate(d: string) {
    if (!d) return "";
    try {
        const date = new Date(d);
        return new Intl.DateTimeFormat("ja-JP", {
            timeZone: "Asia/Tokyo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        })
            .format(date)
            .replace(/\//g, ".");
    } catch {
        return d.substring(0, 10).replace(/-/g, ".");
    }
}

export default function HomePage() {
    const { data: session } = useSession();
    const router = useRouter();
    const { language } = useLanguage();

    const [posts, setPosts] = useState<Post[]>([]);
    const [searchQuery, setSearchQuery] = useState("");

    const [overlayOpen, setOverlayOpen] = useState(false);
    const [overlayPostId, setOverlayPostId] = useState<string | null>(null);
    const [overlayContent, setOverlayContent] = useState("");
    const [overlayMeta, setOverlayMeta] = useState({ date: "", tags: [] as string[], author: "" });

    const [translatedContent, setTranslatedContent] = useState<string | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [translateTarget, setTranslateTarget] = useState<string>(language === "ja" ? "en" : "ja");

    useEffect(() => {
        fetch("/api/posts")
            .then((r) => r.json())
            .then((data) => {
                setPosts(
                    (Array.isArray(data) ? data : []).map((p: Post) => ({
                        ...p,
                        excerpt: p.excerpt || "",
                    }))
                );
            })
            .catch(console.error);
    }, []);

    const openPost = (post: Post) => {
        setOverlayMeta({
            date: fmtDate(post.createdAt),
            tags: post.tags || [],
            author: post.author?.name || "",
        });
        setOverlayPostId(post.id);
        setOverlayContent(post.content || "<p>No content.</p>");
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
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeOverlay();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, []);

    useEffect(() => {
        const handleClick = (e: MouseEvent | Event) => {
            const target = e.target as HTMLElement;
            const anchor = target.tagName === "A" ? (target as HTMLAnchorElement) : target.closest("a");
            if (!anchor) return;
            const url = anchor.getAttribute("href");
            if (url && (url.startsWith("http") || url.startsWith("//"))) {
                anchor.setAttribute("target", "_blank");
                anchor.setAttribute("rel", "noopener noreferrer");
            }
        };

        const container = document.querySelector(".post-overlay");
        if (container) {
            container.addEventListener("click", handleClick);
            return () => container.removeEventListener("click", handleClick);
        }
    }, [overlayOpen]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/user/${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    const handleTranslate = async () => {
        if (translatedContent) {
            setTranslatedContent(null);
            return;
        }

        setIsTranslating(true);
        try {
            const res = await fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: overlayContent, targetLang: translateTarget }),
            });
            const data = await res.json();
            if (data.translatedText) {
                setTranslatedContent(data.translatedText);
            } else {
                alert("Translation failed.");
            }
        } catch (e) {
            console.error(e);
            alert("Translation failed.");
        } finally {
            setIsTranslating(false);
        }
    };

    const blogPosts = posts.filter((p) => !p.tags?.includes("product"));
    const productPosts = posts.filter((p) => p.tags?.includes("product"));

    return (
        <>
            <nav className="navbar" id="navbar" style={{ justifyContent: "space-between" }}>
                <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>
                    <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                    Next Blog <span className="beta-badge">ﾎｲ</span>
                </Link>
                <div className="nav-auth">
                    {session ? (
                        <>
                            <Link href="/editor" className="nav-auth-btn nav-write-btn">
                                Write
                            </Link>
                            <Link
                                href={`/user/${session.user?.name || ""}`}
                                className="nav-auth-btn nav-user-btn"
                                style={{ textDecoration: "none" }}
                            >
                                My page
                            </Link>
                            <Link href="/settings" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                                Settings
                            </Link>
                        </>
                    ) : (
                        <Link href="/login" className="nav-auth-btn nav-login-btn">
                            Log in
                        </Link>
                    )}
                </div>
            </nav>

            <div className="main-content">
                <section className="hero">
                    <div className="hero-content">
                        <h1
                            style={{
                                fontFamily: "var(--serif)",
                                fontSize: "clamp(32px, 5vw, 48px)",
                                fontWeight: 300,
                                color: "var(--azuki-deep)",
                                marginBottom: 12,
                                letterSpacing: "0.06em",
                            }}
                        >
                            Next Blog
                        </h1>
                        <p
                            style={{
                                fontSize: 15,
                                color: "var(--text-soft)",
                                maxWidth: 420,
                                margin: "0 auto",
                                lineHeight: 1.8,
                            }}
                        >
                            Share your ideas, products, and technical notes.
                        </p>

                        <form onSubmit={handleSearch} style={{ marginTop: 32, display: "flex", justifyContent: "center", gap: 8 }}>
                            <input
                                type="text"
                                placeholder="Find user..."
                                className="login-input"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ width: 280, marginBottom: 0, border: "1px solid var(--border)", background: "var(--bg-card)" }}
                            />
                            <button type="submit" className="editor-btn editor-btn-primary" style={{ padding: "0 24px" }}>
                                Search
                            </button>
                        </form>
                    </div>
                </section>

                <div className="section-divider" />

                <section className="section">
                    <h2 className="section-title">Recent Blog Posts</h2>
                    {blogPosts.length === 0 ? (
                        <p style={{ textAlign: "center", color: "var(--text-soft)", padding: "40px 0" }}>
                            No posts yet.
                        </p>
                    ) : (
                        <div className="blog-list">
                            {blogPosts.slice(0, 10).map((p) => (
                                <div key={p.id} className="blog-item" onClick={() => openPost(p)} style={{ cursor: "pointer" }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                                            <h3 style={{ margin: 0 }}>{p.title}</h3>
                                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                                {(p.tags || [])
                                                    .filter((t) => t !== "product")
                                                    .map((t) => {
                                                        const c = TAG_COLORS[t] || "#9b6b6b";
                                                        return (
                                                            <span key={t} className="tag" style={{ color: c, background: c + "18", border: `1px solid ${c}30` }}>
                                                                {t}
                                                            </span>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                        <p>{p.excerpt}</p>
                                        <div style={{ fontSize: 12, color: "var(--azuki-light)", marginTop: 8 }}>
                                            by{" "}
                                            <Link
                                                href={`/user/${p.author?.name || ""}`}
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

                {productPosts.length > 0 && (
                    <>
                        <div className="section-divider" />
                        <section className="section">
                            <h2 className="section-title">Products</h2>
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
                )}
            </div>

            <footer className="footer">
                <span className="footer-copy">ﾂｩ 2026 Next Blog</span>
            </footer>

            <div className={`post-overlay ${overlayOpen ? "open" : ""}`} onClick={closeOverlay}>
                <div className="post-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="post-panel-header">
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{overlayMeta.date}</span>
                            {overlayMeta.author && <span style={{ fontSize: 12, color: "var(--azuki-light)" }}>by {overlayMeta.author}</span>}
                        </div>
                        <button className="post-close-btn" onClick={closeOverlay}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                    <div className="post-panel-body">
                        {overlayMeta.tags.length > 0 && (
                            <div className="post-meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div>
                                    {overlayMeta.tags
                                        .filter((t) => t !== "product")
                                        .map((t) => {
                                            const c = TAG_COLORS[t] || "#9b6b6b";
                                            return (
                                                <span key={t} className="tag" style={{ color: c, background: c + "18", border: `1px solid ${c}30` }}>
                                                    {t}
                                                </span>
                                            );
                                        })}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <select
                                        value={translateTarget}
                                        onChange={(e) => setTranslateTarget(e.target.value)}
                                        style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-soft)", fontSize: 11, padding: "2px 4px", borderRadius: 4 }}
                                    >
                                        <option value="ja">Japanese</option>
                                        <option value="en">English</option>
                                        <option value="zh">Chinese</option>
                                    </select>
                                    <button
                                        className="editor-btn editor-btn-secondary"
                                        onClick={handleTranslate}
                                        disabled={isTranslating}
                                        style={{ padding: "4px 8px", fontSize: 11, background: "transparent", border: "1px solid var(--border)" }}
                                    >
                                        {isTranslating ? "..." : translatedContent ? "Revert" : "Translate"}
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="md-content" dangerouslySetInnerHTML={{ __html: translatedContent || overlayContent }} />
                        <PostComments postId={overlayPostId} isSignedIn={!!session?.user} />
                    </div>
                </div>
            </div>
        </>
    );
}