/* eslint-disable @next/next/no-img-element */
"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import UnreadDmButton from "@/components/UnreadDmButton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMyPageHref } from "@/hooks/useMyPageHref";

export default function Navbar() {
    const { data: session } = useSession();
    const { localizePath, t } = useLanguage();
    const myPageHref = useMyPageHref();

    const scrollTo = (id: string) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth" });
    };

    return (
        <nav className="navbar" id="navbar">
            <button className="nav-logo" onClick={() => scrollTo("home")}>
                <img src="/images/a.png" alt="Next Blog" className="nav-logo-img" />
                Next Blog <span className="beta-badge">ﾎｲ</span>
            </button>
            <div className="nav-links">
                <button className="nav-link active" data-section="home" onClick={() => scrollTo("home")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                    {t("nav.home", "Home")}
                </button>
                <button className="nav-link" data-section="blog" onClick={() => scrollTo("blog")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                    {t("nav.blog", "Blog")}
                </button>
                <button className="nav-link" data-section="product" onClick={() => scrollTo("product")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                    {t("nav.product", "Product")}
                </button>
            </div>
            <div className="nav-auth">
                {session ? (
                    <>
                        <Link href={localizePath("/editor")} className="nav-auth-btn nav-write-btn" title={t("nav.write", "Write")}>
                            笨搾ｸ・
                        </Link>
                        <Link
                            href={myPageHref}
                            className="nav-auth-btn nav-user-btn"
                            title={t("nav.myPage", "My Page")}
                            style={{ textDecoration: "none" }}
                        >
                            側
                        </Link>
                        <Link href={localizePath("/settings")} className="nav-auth-btn nav-user-btn" style={{ textDecoration: "none" }}>
                            笞・
                        </Link>
                        <UnreadDmButton className="nav-auth-btn nav-user-btn" />
                    </>
                ) : (
                    <Link href={localizePath("/login")} className="nav-auth-btn nav-login-btn">
                        {t("nav.login", "Login")}
                    </Link>
                )}
            </div>
        </nav>
    );
}
