"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PostComments from "@/components/PostComments";
import UserCollaborationPanel from "@/components/UserCollaborationPanel";

interface Post {
    id: string;
    title: string;
    content?: string;
    excerpt?: string;
    headerImage?: string;
    tags: string[];
    createdAt: string;
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
    dmSetting?: "OPEN" | "PR_ONLY" | "CLOSED";
    posts: Post[];
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

export default function UserPage() {
    const { data: session } = useSession();
    const params = useParams();
    const userName = params.name as string;

    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const [overlayOpen, setOverlayOpen] = useState(false);
    const [overlayPostId, setOverlayPostId] = useState<string | null>(null);
    const [overlayContent, setOverlayContent] = useState("");
    const [overlayMeta, setOverlayMeta] = useState<{ date: string; tags: string[] }>({ date: "", tags: [] });

    const [translatedContent, setTranslatedContent] = useState<string | null>(null);
    const [isTranslating, setIsTranslating] = useState(false);
    const [translateTarget, setTranslateTarget] = useState<string>("en");

    useEffect(() => {
        const loadUser = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/user/${encodeURIComponent(userName)}`);
                if (!res.ok) {
                    setUser(null);
                    return;
                }
                const data = await res.json();
                setUser(data);
            } catch {
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        if (userName) {
            void loadUser();
        }
    }, [userName]);

    const openPost = (post: Post) => {
        setOverlayMeta({ date: fmtDate(post.createdAt), tags: post.tags || [] });
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
        } catch {
            alert("Translation failed.");
        } finally {
            setIsTranslating(false);
        }
    };

    if (loading) {
        return (
            <div className="login-container">
                <div className="login-card" style={{ textAlign: "center" }}>
                    <p style={{ color: "var(--text-soft)" }}>Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="login-container">
                <div className="login-card" style={{ textAlign: "center" }}>
                    <h2 style={{ fontFamily: "var(--serif)", marginBottom: 16 }}>User not found</h2>
                    <Link href="/" style={{ color: "var(--azuki)", textDecoration: "none" }}>
                        Back to home
                    </Link>
                </div>
            </div>
        );
    }

    const displayName = user.name || userName;
    const isOwnProfile = !!session?.user && (session.user as { id?: string }).id === user.id;

    const blogPosts = (user.posts || []).filter((p) => !p.tags?.includes("product"));
    const productPosts = (user.posts || []).filter((p) => p.tags?.includes("product"));

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
                <section className="section" style={{ paddingTop: 96 }}>
                    <div className="hero">
                        <div
                            className="hero-bg"
                            style={user.headerImage ? { backgroundImage: `url(${user.headerImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                        />
                        <div className="hero-content" style={user.headerImage ? { position: "relative", zIndex: 1 } : undefined}>
                            <h1 style={user.headerImage ? { color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.7)" } : undefined}>
                                {displayName}
                            </h1>
                            <p style={user.headerImage ? { color: "#eee", textShadow: "0 1px 5px rgba(0,0,0,0.7)" } : undefined}>
                                {user.bio || "No bio yet."}
                            </p>
                        </div>
                    </div>
                </section>

                <section className="section" style={{ paddingTop: 24 }}>
                    <h2 className="section-title">About</h2>
                    <div className="about-header">
                        <div
                            className="about-avatar"
                            style={{
                                width: 72,
                                height: 72,
                                borderRadius: "50%",
                                background: "var(--bg-soft)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 28,
                                color: "var(--azuki)",
                                overflow: "hidden",
                                border: "1px solid var(--border)",
                            }}
                        >
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

                    {user.links && user.links.length > 0 && (
                        <div className="contact-section" style={{ marginTop: 20 }}>
                            <h3 className="contact-title">Links</h3>
                            <div className="contact-links">
                                {user.links.map((link, i) => {
                                    const isEmail = link.label.toLowerCase() === "email";
                                    const rawUrl = isEmail && !link.url.startsWith("mailto:") ? `mailto:${link.url}` : link.url;
                                    const displayUrl = link.url.replace(/^https?:\/\//, "").replace(/^mailto:/, "");

                                    return (
                                        <a key={i} href={rawUrl} target="_blank" rel="noopener noreferrer" className="contact-link">
                                            <div className="contact-link-inner">
                                                <div className="contact-icon" style={{ background: "rgba(155,107,107,0.08)", color: "var(--azuki)" }}>
                                                    {link.label.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="contact-name">{link.label}</div>
                                                    <div className="contact-handle">{displayUrl}</div>
                                                </div>
                                            </div>
                                        </a>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {!isOwnProfile && (
                        <UserCollaborationPanel
                            recipientId={user.id}
                            recipientName={displayName}
                            dmSetting={user.dmSetting || "OPEN"}
                            isSignedIn={!!session?.user}
                        />
                    )}
                </section>

                <div className="section-divider" />

                <section className="section">
                    <h2 className="section-title">Blog</h2>
                    {blogPosts.length === 0 ? (
                        <p style={{ textAlign: "center", color: "var(--text-soft)", padding: "30px 0" }}>No blog posts yet.</p>
                    ) : (
                        <div className="blog-list">
                            {blogPosts.map((post) => (
                                <article key={post.id} className="blog-item" onClick={() => openPost(post)}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                                            <h3 style={{ margin: 0 }}>{post.title}</h3>
                                            {(post.tags || [])
                                                .filter((t) => t !== "product")
                                                .map((tag) => {
                                                    const color = TAG_COLORS[tag] || "#9b6b6b";
                                                    return (
                                                        <span key={tag} className="tag" style={{ color, background: color + "18", border: `1px solid ${color}30` }}>
                                                            {tag}
                                                        </span>
                                                    );
                                                })}
                                        </div>
                                        <p>{post.excerpt || ""}</p>
                                    </div>
                                    <div className="blog-date">{fmtDate(post.createdAt)}</div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>

                <div className="section-divider" />

                <section className="section">
                    <h2 className="section-title">Products</h2>
                    {productPosts.length === 0 ? (
                        <p style={{ textAlign: "center", color: "var(--text-soft)", padding: "30px 0" }}>No products yet.</p>
                    ) : (
                        <div className="product-grid">
                            {productPosts.map((post) => (
                                <div key={post.id} className="product-card" onClick={() => openPost(post)}>
                                    {post.headerImage ? (
                                        <img src={post.headerImage} alt={post.title} style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 10, marginBottom: 8 }} />
                                    ) : (
                                        <div className="product-thumb" style={{ background: "linear-gradient(135deg,#e8d5d0,#e8d5d088)" }}>
                                            <div className="product-thumb-inner" />
                                        </div>
                                    )}
                                    <div className="product-info">
                                        <h3>{post.title}</h3>
                                        <p>{post.excerpt || ""}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <footer className="footer">
                <span className="footer-copy">ﾂｩ 2026 Next Blog</span>
            </footer>

            <div className={`post-overlay ${overlayOpen ? "open" : ""}`} onClick={closeOverlay}>
                <div className="post-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="post-panel-header">
                        <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{overlayMeta.date}</span>
                        <button className="post-close-btn" onClick={closeOverlay}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                    <div className="post-panel-body">
                        <div className="post-meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                                {overlayMeta.tags
                                    .filter((t) => t !== "product")
                                    .map((t) => {
                                        const color = TAG_COLORS[t] || "#9b6b6b";
                                        return (
                                            <span key={t} className="tag" style={{ color, background: color + "18", border: `1px solid ${color}30` }}>
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
                        <div className="md-content" dangerouslySetInnerHTML={{ __html: translatedContent || overlayContent }} />
                        <PostComments postId={overlayPostId} isSignedIn={!!session?.user} />
                    </div>
                </div>
            </div>
        </>
    );
}