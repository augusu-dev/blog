"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export default function Navbar() {
    const { data: session } = useSession();

    const scrollTo = (id: string) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth" });
    };

    return (
        <nav className="navbar" id="navbar">
            <button className="nav-logo" onClick={() => scrollTo("home")}>
                <img src="/images/a.png" alt="Augusu" className="nav-logo-img" />
                Augusu
            </button>
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
                    About Me
                </button>
            </div>
            <div className="nav-auth">
                {session ? (
                    <>
                        <Link href="/editor" className="nav-auth-btn nav-write-btn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                            記事を書く
                        </Link>
                        <button className="nav-auth-btn nav-user-btn" onClick={() => signOut()}>
                            ログアウト
                        </button>
                    </>
                ) : (
                    <Link href="/login" className="nav-auth-btn nav-login-btn">
                        ログイン
                    </Link>
                )}
            </div>
        </nav>
    );
}
