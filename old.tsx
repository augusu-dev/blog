"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { marked } from "marked";
import Navbar from "@/components/Navbar";

/* ─── Types ─── */
interface Post {
  id: string;
  title: string;
  content?: string;
  excerpt?: string;
  tags: string[];
  published?: boolean;
  createdAt: string;
  updatedAt?: string;
  author?: { name: string | null; email: string | null };
  // Legacy fields from static JSON
  slug?: string;
  date?: string;
  file?: string;
  section?: string;
}

interface Product {
  id: string;
  name: string;
  desc: string;
  color: string;
  // Legacy fields
  slug?: string;
  title?: string;
  date?: string;
  file?: string;
  section?: string;
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
    <span
      className="tag"
      style={{ color: c, background: c + "18", border: `1px solid ${c}30` }}
    >
      {label}
    </span>
  );
}

function fmtDate(d: string) {
  if (!d) return "";
  // Handle ISO dates and simple dates
  return d.substring(0, 10).replace(/-/g, ".");
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ════════════════════════════════════════ */
export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayContent, setOverlayContent] = useState("");
  const [overlayMeta, setOverlayMeta] = useState<{ date: string; tags: string[] }>({ date: "", tags: [] });
  const [overlayType, setOverlayType] = useState<"post" | "product">("post");

  // Blog pagination
  const BLOG_PER_PAGE = 7;
  const [blogPage, setBlogPage] = useState(0);

  // Product progressive + pagination
  const PROD_PER_PAGE = 12;
  const [prodShown, setProdShown] = useState(4);
  const [prodPagMode, setProdPagMode] = useState(false);
  const [prodPage, setProdPage] = useState(0);

  // Refs for intersection observer
  const sectionsRef = useRef<HTMLElement[]>([]);

  /* ─── Fetch data ─── */
  useEffect(() => {
    // Try DB API first, fallback to static JSON
    async function loadData() {
      try {
        const res = await fetch("/api/posts");
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) {
            setPosts(data.map((p: Post) => ({
              ...p,
              date: p.date || p.createdAt,
              excerpt: p.excerpt || (p.content ? p.content.substring(0, 100) + "..." : ""),
            })));
          } else {
            throw new Error("No posts in DB");
          }
        } else {
          throw new Error("API failed");
        }
      } catch {
        // Fallback to static posts.json
        try {
          const r = await fetch("/posts.json");
          if (r.ok) {
            const data = await r.json();
            setPosts(data);
          }
        } catch (e) { console.warn("posts.json load failed:", e); }
      }

      try {
        const res = await fetch("/api/products");
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) {
            setProducts(data);
          } else {
            throw new Error("No products in DB");
          }
        } else {
          throw new Error("API failed");
        }
      } catch {
        try {
          const r = await fetch("/products.json");
          if (r.ok) {
            const data = await r.json();
            setProducts(data);
          }
        } catch (e) { console.warn("products.json load failed:", e); }
      }
    }
    loadData();
  }, []);

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
            // Fade in children
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
  }, [posts, products]);

  /* ─── Open post ─── */
  const openPost = async (post: Post) => {
    setOverlayType("post");
    setOverlayMeta({ date: fmtDate(post.date || post.createdAt), tags: post.tags || [] });
    setOverlayContent("<p style='color:var(--text-soft)'>読み込み中...</p>");
    setOverlayOpen(true);
    document.body.style.overflow = "hidden";

    // URLを変更（ページ遷移なし）
    const postId = post.slug || post.id;
    window.history.pushState({ type: "post", id: postId }, "", `/post/${postId}`);

    // If post has content from DB, render it directly
    if (post.content) {
      setOverlayContent(marked.parse(post.content) as string);
      return;
    }

    // Otherwise try to load from posts/ directory (legacy)
    if (post.file) {
      try {
        const res = await fetch(`/posts/${post.file}`);
        if (res.ok) {
          const md = await res.text();
          setOverlayContent(marked.parse(md) as string);
          return;
        }
      } catch { /* fallback below */ }
    }

    // Try loading by slug or id
    const filename = (post.slug || post.id) + ".md";
    try {
      const res = await fetch(`/posts/${filename}`);
      if (res.ok) {
        const md = await res.text();
        setOverlayContent(marked.parse(md) as string);
        return;
      }
    } catch { /* */ }

    setOverlayContent("<p style='color:var(--text-soft)'>記事の読み込みに失敗しました。</p>");
  };

  /* ─── Open product ─── */
  const openProduct = (prod: Product) => {
    setOverlayType("product");
    setOverlayMeta({ date: "Product", tags: [] });
    setOverlayContent(
      `<h1 style="font-family:var(--serif);font-size:28px;font-weight:400;color:var(--text);margin-bottom:16px">${prod.name || prod.title}</h1>` +
      `<div style="height:120px;border-radius:14px;margin-bottom:24px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,${prod.color},${prod.color}88)">` +
      `<div style="width:56px;height:56px;border-radius:14px;background:rgba(255,255,255,0.45)"></div>` +
      `</div>` +
      `<p style="font-size:15px;color:var(--text);line-height:2">${prod.desc}</p>`
    );
    setOverlayOpen(true);
    document.body.style.overflow = "hidden";

    // URLを変更（ページ遷移なし）
    const prodId = prod.slug || prod.id;
    window.history.pushState({ type: "product", id: prodId }, "", `/product/${prodId}`);
  };

  const closeOverlay = () => {
    setOverlayOpen(false);
    document.body.style.overflow = "";
    // URLを元に戻す
    if (window.location.pathname !== "/") {
      window.history.pushState({}, "", "/");
    }
  };

  // ブラウザの戻るボタンで閉じる場合（URLは既に変わっている）
  const closeOverlayFromPopState = () => {
    setOverlayOpen(false);
    document.body.style.overflow = "";
  };

  /* ─── Escape key ─── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeOverlay(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  /* ─── Browser back button ─── */
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === "/") {
        closeOverlayFromPopState();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  /* ─── Computed pagination ─── */
  const blogTotalPages = Math.ceil(posts.length / BLOG_PER_PAGE);
  const blogItems = posts.slice(blogPage * BLOG_PER_PAGE, (blogPage + 1) * BLOG_PER_PAGE);

  const currentProducts = prodPagMode
    ? products.slice(prodPage * PROD_PER_PAGE, (prodPage + 1) * PROD_PER_PAGE)
    : products.slice(0, prodShown);
  const prodTotalPages = Math.ceil(products.length / PROD_PER_PAGE);

  const loadMoreProducts = () => {
    const next = Math.min(prodShown + 4, products.length);
    setProdShown(next);
    if (next >= 12 && products.length > 12) {
      setProdPagMode(true);
      setProdPage(0);
    }
  };

  /* ─── Home recommendations ─── */
  const randProducts = products.length > 0 ? shuffle(products).slice(0, 2) : [];
  const randPosts = posts.length > 0 ? shuffle(posts).slice(0, 3) : [];

  return (
    <>
      <Navbar />

      {/* ====== PAGE DOTS ====== */}
      <div className="page-dots" id="pageDots">
        {SECTIONS.map((s) => (
          <div key={s} className={`page-dot ${s === "home" ? "active" : ""}`} style={{ width: s === "home" ? 20 : 6 }} data-section={s} />
        ))}
      </div>

      {/* ====== MAIN CONTENT ====== */}
      <div className="main-content">

        {/* ──── HOME ──── */}
        <section
          className="section visible"
          id="home"
          ref={(el) => { if (el) sectionsRef.current[0] = el; }}
        >
          <div className="hero">
            <div className="hero-bg" />
            <div className="hero-content">
              <h1>Augusu Blog</h1>
              <p>学び、作り、考える。日々の記録。</p>
            </div>
          </div>
          <h2 className="section-title fade-item">おすすめ</h2>
          <div className="recommend-grid">
            {randProducts.map((p) => (
              <div
                key={p.id}
                className="card fade-item"
                style={{ padding: 0, minHeight: 160, display: "flex", flexDirection: "column", overflow: "hidden" }}
                onClick={() => openProduct(p)}
              >
                <div style={{ height: 80, background: `linear-gradient(135deg,${p.color},${p.color}88)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.45)" }} />
                </div>
                <div style={{ padding: "18px 20px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, marginBottom: 6 }}>{p.name || p.title}</h3>
                    <p style={{ fontSize: 13, color: "var(--text-soft)", lineHeight: 1.6 }}>{p.desc}</p>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--azuki-light)", marginTop: 10 }}>Product</div>
                </div>
              </div>
            ))}
          </div>
          <div className="recommend-row">
            {randPosts.map((p) => (
              <div
                key={p.id || p.slug}
                className="card card-sm fade-item"
                style={{ padding: 18 }}
                onClick={() => openPost(p)}
              >
                <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
                  {(p.tags || []).map((t) => <Tag key={t} label={t} />)}
                </div>
                <h4 style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5, marginBottom: 6 }}>{p.title}</h4>
                <p style={{ fontSize: 12, color: "var(--azuki-light)" }}>{fmtDate(p.date || p.createdAt)}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="section-divider" />

        {/* ──── BLOG ──── */}
        <section
          className="section"
          id="blog"
          ref={(el) => { if (el) sectionsRef.current[1] = el; }}
        >
          <h2 className="section-title">Blog</h2>
          <div className="blog-list">
            {blogItems.map((p, i) => (
              <div
                key={p.id || p.slug}
                className="blog-item fade-item"
                style={{ transitionDelay: `${i * 60}ms` }}
                onClick={() => openPost(p)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                    {(p.tags || []).map((t) => <Tag key={t} label={t} />)}
                  </div>
                  <h3>{p.title}</h3>
                  <p>{p.excerpt}</p>
                </div>
                <div className="blog-date">{fmtDate(p.date || p.createdAt)}</div>
              </div>
            ))}
          </div>
          {blogTotalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                onClick={() => setBlogPage(Math.max(0, blogPage - 1))}
                disabled={blogPage === 0}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="page-info">{blogPage + 1} / {blogTotalPages}</span>
              <button
                className="page-btn"
                onClick={() => setBlogPage(Math.min(blogTotalPages - 1, blogPage + 1))}
                disabled={blogPage === blogTotalPages - 1}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          )}
        </section>

        <div className="section-divider" />

        {/* ──── PRODUCT ──── */}
        <section
          className="section"
          id="product"
          ref={(el) => { if (el) sectionsRef.current[2] = el; }}
        >
          <h2 className="section-title">Product</h2>
          <div className="product-grid">
            {currentProducts.map((p) => (
              <div
                key={p.id}
                className="product-card fade-item"
                onClick={() => openProduct(p)}
              >
                <div className="product-thumb" style={{ background: `linear-gradient(135deg,${p.color},${p.color}88)` }}>
                  <div className="product-thumb-inner" />
                </div>
                <div className="product-info">
                  <h3>{p.name || p.title}</h3>
                  <p>{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
          {!prodPagMode && prodShown < products.length && prodShown < 12 && (
            <button className="more-btn" onClick={loadMoreProducts}>もっと見る ＋</button>
          )}
          {prodPagMode && prodTotalPages > 1 && (
            <div className="pagination">
              <button
                className="page-btn"
                onClick={() => setProdPage(Math.max(0, prodPage - 1))}
                disabled={prodPage === 0}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="page-info">{prodPage + 1} / {prodTotalPages}</span>
              <button
                className="page-btn"
                onClick={() => setProdPage(Math.min(prodTotalPages - 1, prodPage + 1))}
                disabled={prodPage === prodTotalPages - 1}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          )}
        </section>

        <div className="section-divider" />

        {/* ──── ABOUT ME ──── */}
        <section
          className="section"
          id="about"
          ref={(el) => { if (el) sectionsRef.current[3] = el; }}
        >
          <h2 className="section-title">About Me</h2>
          <div className="about-header">
            <img src="/images/a.png" alt="Augusu" className="about-avatar" />
            <div>
              <h3 className="about-name">Augusu</h3>
              <p className="about-role">開発者 / 思考する人</p>
            </div>
          </div>
          <div className="about-bio">
            <p>学ぶこと、作ること、考えることが好きです。テクノロジーと哲学の交差点で、小さなプロジェクトや文章を生み出しています。</p>
            <p>このブログでは、日々の学びや実験、考察を記録しています。コードを書くことも、言葉を紡ぐことも、どちらも同じ「表現」だと思っています。</p>
            <p>AIと共に成長し、希少価値を生み出すクリエイターを目指します。ふと思ったこと、考えを自分の言葉で表します。</p>
          </div>
          <div className="skill-tags">
            {["JavaScript", "React", "Three.js", "Python", "哲学", "仏教思想", "AI"].map((s) => (
              <span key={s} className="skill-tag">{s}</span>
            ))}
          </div>
          <div
            className="scroll-hint"
            onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}
          >
            <p>Contact</p>
            <div className="scroll-line" />
          </div>
          <div className="contact-section" id="contact">
            <h3 className="contact-title">Contact</h3>
            <p className="contact-desc">ご連絡はSNSからお気軽にどうぞ。</p>
            <div className="contact-links">
              <a href="https://bsky.app/profile/augusu.bsky.social" target="_blank" rel="noopener" className="contact-link">
                <div className="contact-link-inner">
                  <div className="contact-icon" style={{ background: "rgba(0,133,255,0.08)", color: "#0085ff" }}>B</div>
                  <div>
                    <div className="contact-name">Bluesky</div>
                    <div className="contact-handle">@augusu.bsky.social</div>
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--azuki-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              </a>
              <a href="https://github.com/augusu-dev" target="_blank" rel="noopener" className="contact-link">
                <div className="contact-link-inner">
                  <div className="contact-icon" style={{ background: "rgba(51,51,51,0.08)", color: "#333" }}>G</div>
                  <div>
                    <div className="contact-name">GitHub</div>
                    <div className="contact-handle">github.com/augusu-dev</div>
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--azuki-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              </a>
            </div>
          </div>
        </section>
      </div>

      {/* ====== FOOTER ====== */}
      <footer className="footer">
        <span className="footer-copy">© 2026 Augusu Blog</span>
      </footer>

      {/* ====== POST READER OVERLAY ====== */}
      <div
        className={`post-overlay ${overlayOpen ? "open" : ""}`}
        onClick={closeOverlay}
      >
        <div className="post-panel" onClick={(e) => e.stopPropagation()}>
          <div className="post-panel-header">
            <span style={{ fontSize: 13, color: "var(--text-soft)" }}>{overlayMeta.date}</span>
            <button className="post-close-btn" onClick={closeOverlay}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <div className="post-panel-body">
            <div className="post-meta">
              {overlayMeta.tags.map((t) => <Tag key={t} label={t} />)}
            </div>
            <div
              className="md-content"
              dangerouslySetInnerHTML={{ __html: overlayContent }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
