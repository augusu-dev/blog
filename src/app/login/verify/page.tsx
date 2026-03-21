"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function VerifyPage() {
    const { localizePath, t } = useLanguage();

    return (
        <div className="login-container">
            <div className="login-card">
                <h1 className="login-title">{t("verify.title", "Check your email")}</h1>
                <div className="login-message">
                    <strong>{t("verify.success", "We sent you a login link")}</strong><br />
                    <span style={{ fontSize: 13 }}>
                        {t("verify.instructions", "Open your inbox and click the login link.")}<br />
                        {t("verify.noMail", "If you do not see the email, please check your spam folder as well.")}
                    </span>
                </div>
                <Link href={localizePath("/login")} className="login-back">
                    {t("verify.backToLogin", "Back to login")}
                </Link>
            </div>
        </div>
    );
}
