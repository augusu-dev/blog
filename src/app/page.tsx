"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  "AI": "#d4877a", "思考": "#8a7a6b", "コード": "#6b7a8a",
  "3D": "#8a6b7a", "哲学": "#7a6b8a", "テクノロジー": "#d4877a",
  "社会": "#6b8a7a", "作品": "#7a8a6b", "ツール": "#6b8a8a",
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
    }).format(date).replace(/\//g, ".");
  } catch {
    return d.substring(0, 10).replace(/-/g, ".");
  }
}

export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayContent, setOverlayContent] = useState("");
  const [overlayMeta, setOverlayMeta] = useState({ date: "", tags: [] as string[], author: "" });
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/posts")
      .then((r) => r.json())
      .then((data) => {
        setPosts(data.map((p: Post) => ({
          ...p,
          excerpt: p.excerpt || (p.content ? p.content.replace(/<[^>]*>/g, "").substring(0, 120) + "..." : ""),
        })));
      })
      .catch(console.error);
  }, []);

  const openPost = (post: Post) => {
    setOverlayMeta({
      date: fmtDate(post.createdAt),
      tags: post.tags || [],
      author: post.author?.name || "",
    });
    setOverlayContent(post.content || "<p>記事の内容がありません。</p>");
    setOverlayOpen(true);
    document.body.style.overflow = "hidden";
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

  const blogPosts = posts.filter((p) => !p.tags?.includes("product"));
  const productPosts = posts.filter((p) => p.tags?.includes("product"));

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/user/${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <>
      {/* ─── Navbar ─── */}
      <nav className="navbar" id="navbar" style={{ justifyContent: "space-between" }}>
        <Link href="/" className="nav-logo" style={{ textDecoration: "none" }}>
          <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
          Next Blog
        </Link>
        <div className="nav-auth">
          {session ? (
            <>
              <Link href="/editor" className="nav-auth-btn nav-write-btn">✏ 記事を書く</Link>
              <Link href={`/user/${session.user?.name || ""}`} className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                マイページ
              </Link>
              <Link href="/settings" className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>⚙</Link>
            </>
          ) : (
            <Link href="/login" className="nav-auth-btn nav-login-btn">ログイン</Link>
          )}
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <div className="main-content">
        <section style={{
          textAlign: "center",
          padding: "100px 20px 60px",
        }}>
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
            思考と創造を共有するプラットフォーム。
          </p>

          <form onSubmit={handleSearch} style={{ marginTop: 32, display: "flex", justifyContent: "center", gap: 8 }}>
            <input
              type="text"
              placeholder="ユーザーを検索..."
              className="login-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 280, marginBottom: 0, border: "1px solid var(--border)", background: "var(--bg-card)" }}
            />
            <button type="submit" className="editor-btn editor-btn-primary" style={{ padding: "0 24px" }}>
              検索
            </button>
          </form>
        </section>

        <div className="section-divider" />

        {/* ─── Recent Blog Posts ─── */}
        <section className="section">
          <h2 className="section-title">最近の記事</h2>
          {blogPosts.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-soft)", padding: "40px 0" }}>
              まだ記事がありません。ログインして最初の記事を書きましょう。
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
                          return <span key={t} className="tag" style={{ color: c, background: c + "18", border: `1px solid ${c}30` }}>{t}</span>;
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

        {/* ─── Products ─── */}
        {productPosts.length > 0 && (
          <>
            <div className="section-divider" />
            <section className="section">
              <h2 className="section-title">プロダクト</h2>
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

      {/* ─── Footer ─── */}
      <footer className="footer">
        <span className="footer-copy">© 2026 Next Blog</span>
      </footer>

      {/* ─── Overlay ─── */}
      <div className={`post-overlay ${overlayOpen ? "open" : ""}`} onClick={closeOverlay}>
        <div className="post-panel" onClick={(e) => e.stopPropagation()}>
          <div className="post-panel-header">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{overlayMeta.date}</span>
              {overlayMeta.author && (
                <span style={{ fontSize: 12, color: "var(--azuki-light)" }}>by {overlayMeta.author}</span>
              )}
            </div>
            <button className="post-close-btn" onClick={closeOverlay}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="post-panel-body">
            {overlayMeta.tags.length > 0 && (
              <div className="post-meta">
                {overlayMeta.tags.filter(t => t !== "product").map((t) => {
                  const c = TAG_COLORS[t] || "#9b6b6b";
                  return <span key={t} className="tag" style={{ color: c, background: c + "18", border: `1px solid ${c}30` }}>{t}</span>;
                })}
              </div>
            )}
            <div className="md-content" dangerouslySetInnerHTML={{ __html: overlayContent }} />
          </div>
        </div>
      </div>
    </>
  );
}
