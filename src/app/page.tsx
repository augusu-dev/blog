"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Navbar from "@/components/Navbar";

/* ─── Types ─── */
interface Post {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  headerImage?: string;
  tags: string[];
  published: boolean;
  date?: string;
  createdAt?: string;
  slug?: string;
  file?: string;
  author?: { name: string | null; email: string | null };
}

interface Product {
  id: string;
  name?: string;
  title?: string;
  desc: string;
  color: string;
  headerImage?: string;
  tags?: string[];
  content?: string;
  author?: { name: string | null; email: string | null };
}

/* ─── Helpers ─── */
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";

const stripHtml = (html: string) => {
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, "");
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
};

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeSection, setActiveSection] = useState("home");
  const sectionsRef = useRef<HTMLElement[]>([]);

  /* overlay state */
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayContent, setOverlayContent] = useState("");
  const [overlayMeta, setOverlayMeta] = useState({ date: "", tags: [] as string[], author: "" });
  const [overlayType, setOverlayType] = useState<"post" | "product">("post");

  /* ─── Fetch data ─── */
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/posts");
        if (res.ok) {
          const data = await res.json();
          const allPosts = data.map((p: Post) => ({
            ...p,
            date: p.date || p.createdAt,
            excerpt: p.excerpt || (p.content ? stripHtml(p.content).substring(0, 100) + "..." : ""),
          }));
          setPosts(allPosts.filter((p: Post) => !p.tags?.includes("product")));
          setProducts(allPosts.filter((p: Post) => p.tags?.includes("product")).map((p: Post) => ({
            ...p,
            name: p.title,
            desc: p.excerpt || "",
            color: "#e8d5d0",
          })));
        }
      } catch (e) { console.warn("Failed to load:", e); }
    }
    loadData();
  }, []);

  /* ─── Scroll ─── */
  const SECTIONS = ["home", "blog", "product"];

  const updateNav = useCallback(() => {
    const sy = window.scrollY + 120;
    let cur = "home";
    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= sy) cur = id;
    });
    setActiveSection(cur);
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.toggle("active", link.getAttribute("data-section") === cur);
    });
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", updateNav, { passive: true });
    return () => window.removeEventListener("scroll", updateNav);
  }, [updateNav]);

  /* ─── Open post ─── */
  const openPost = (post: Post) => {
    setOverlayType("post");
    setOverlayMeta({
      date: fmtDate(post.date || post.createdAt),
      tags: post.tags || [],
      author: post.author?.name || "",
    });
    setOverlayOpen(true);
    document.body.style.overflow = "hidden";
    window.history.pushState({ type: "post", id: post.id }, "", `/post/${post.slug || post.id}`);
    setOverlayContent(post.content || "<p>記事の内容がありません。</p>");
  };

  /* ─── Open product ─── */
  const openProduct = (prod: Product) => {
    setOverlayType("product");
    setOverlayMeta({ date: "Product", tags: prod.tags || [], author: prod.author?.name || "" });
    const imgHtml = prod.headerImage
      ? `<img src="${prod.headerImage}" alt="${prod.name || prod.title}" style="width:100%;height:200px;object-fit:cover;border-radius:14px;margin-bottom:24px" />`
      : "";
    setOverlayContent(
      `<h1 style="font-family:var(--serif);font-size:28px;font-weight:400;color:var(--text);margin-bottom:16px">${prod.name || prod.title}</h1>` +
      imgHtml +
      (prod.content || `<p style="font-size:15px;color:var(--text);line-height:2">${prod.desc}</p>`)
    );
    setOverlayOpen(true);
    document.body.style.overflow = "hidden";
    window.history.pushState({ type: "product", id: prod.id }, "", `/product/${prod.id}`);
  };

  /* ─── Close overlay ─── */
  const closeOverlay = () => {
    setOverlayOpen(false);
    document.body.style.overflow = "";
    window.history.pushState(null, "", "/");
  };

  const closeOverlayFromPopState = () => {
    setOverlayOpen(false);
    document.body.style.overflow = "";
  };

  /* ─── ESC + Popstate ─── */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape" && overlayOpen) closeOverlay(); };
    const handlePop = () => { if (overlayOpen) closeOverlayFromPopState(); };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("popstate", handlePop);
    return () => { window.removeEventListener("keydown", handleKey); window.removeEventListener("popstate", handlePop); };
  }, [overlayOpen]);

  return (
    <>
      <Navbar />

      {/* ====== HERO ====== */}
      <section
        className="hero-section"
        id="home"
        ref={(el) => { if (el) sectionsRef.current[0] = el; }}
        style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "120px 20px 60px",
          background: "linear-gradient(180deg, var(--bg-soft) 0%, var(--bg) 100%)",
        }}
      >
        <h1 style={{
          fontFamily: "var(--serif)",
          fontSize: "clamp(36px, 6vw, 56px)",
          fontWeight: 300,
          color: "var(--azuki-deep)",
          marginBottom: 16,
          letterSpacing: "0.06em",
        }}>
          Next Blog
        </h1>
        <p style={{
          fontSize: 16,
          color: "var(--text-soft)",
          maxWidth: 480,
          lineHeight: 1.8,
          marginBottom: 32,
        }}>
          思考と創造を共有するプラットフォーム。<br />
          あなたの言葉を、ここから発信しよう。
        </p>
        {posts.length === 0 && products.length === 0 && (
          <p style={{ fontSize: 14, color: "var(--azuki-pale)" }}>
            まだ投稿がありません。ログインして最初の記事を書きましょう。
          </p>
        )}
      </section>

      {/* ====== BLOG SECTION ====== */}
      {posts.length > 0 && (
        <section
          className="section"
          id="blog"
          ref={(el) => { if (el) sectionsRef.current[1] = el; }}
        >
          <h2 className="section-title">最近の記事</h2>
          <div className="blog-list">
            {posts.map((post, i) => (
              <article
                key={post.id}
                className="blog-card"
                onClick={() => openPost(post)}
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <div className="blog-card-top">
                  <div className="blog-tags">
                    {(post.tags || []).filter(t => t !== "product").slice(0, 3).map((t) => (
                      <span key={t} className="blog-tag">{t}</span>
                    ))}
                  </div>
                  <span className="blog-date">{fmtDate(post.date)}</span>
                </div>
                <h3 className="blog-title">{post.title}</h3>
                <p className="blog-excerpt">{stripHtml(post.excerpt || "")}</p>
                <div style={{ marginTop: "auto", paddingTop: 8, fontSize: 12, color: "var(--azuki-light)" }}>
                  by {post.author?.name || "Anonymous"}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ====== PRODUCT SECTION ====== */}
      {products.length > 0 && (
        <section
          className="section"
          id="product"
          ref={(el) => { if (el) sectionsRef.current[2] = el; }}
        >
          <h2 className="section-title">プロダクト</h2>
          <div className="product-showcase">
            {products.map((prod, i) => (
              <div
                key={prod.id}
                className="product-card"
                onClick={() => openProduct(prod)}
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                {prod.headerImage ? (
                  <img
                    src={prod.headerImage}
                    alt={prod.name || prod.title || ""}
                    style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 10, marginBottom: 12 }}
                  />
                ) : (
                  <div
                    className="product-visual"
                    style={{ background: `linear-gradient(135deg,${prod.color},${prod.color}88)` }}
                  >
                    <div className="product-icon" />
                  </div>
                )}
                <h3 className="product-name">{prod.name || prod.title}</h3>
                <p className="product-desc">{prod.desc}</p>
                <div style={{ marginTop: "auto", paddingTop: 8, fontSize: 11, color: "var(--azuki-light)" }}>
                  by {prod.author?.name || "Anonymous"}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ====== FOOTER ====== */}
      <footer className="footer">
        <span className="footer-copy">© 2026 Next Blog</span>
      </footer>

      {/* ====== POST READER OVERLAY ====== */}
      <div
        className={`post-overlay ${overlayOpen ? "open" : ""}`}
        onClick={closeOverlay}
      >
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
          {overlayMeta.tags.length > 0 && (
            <div style={{ padding: "0 40px", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {overlayMeta.tags.filter(t => t !== "product").map((t) => (
                <span key={t} className="blog-tag">{t}</span>
              ))}
            </div>
          )}
          <div className="post-panel-body">
            <div className="md-content" dangerouslySetInnerHTML={{ __html: overlayContent }} />
          </div>
        </div>
      </div>
    </>
  );
}
