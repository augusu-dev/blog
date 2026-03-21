"use client";

import { CSSProperties, MouseEvent } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export type PublicUserAvatar = {
    id: string;
    userId?: string | null;
    name: string | null;
    email: string | null;
    image?: string | null;
};

type PublicUserAvatarLinkProps = {
    user?: PublicUserAvatar | null;
    size?: number;
    title?: string;
    style?: CSSProperties;
    stopPropagation?: boolean;
};

export function getPublicUserLabel(user?: PublicUserAvatar | null): string {
    return user?.name || user?.email || "Anonymous";
}

export function getPublicUserHref(
    user?: Pick<PublicUserAvatar, "id" | "userId"> | null,
    localizePath?: (path: string) => string
): string {
    if (!user?.id) {
        return "#";
    }

    const path = `/user/${encodeURIComponent(user.userId || user.id)}`;
    return localizePath ? localizePath(path) : path;
}

export default function PublicUserAvatarLink({
    user,
    size = 24,
    title = "繝壹・繧ｸ縺ｫ鬟帙・",
    style,
    stopPropagation = false,
}: PublicUserAvatarLinkProps) {
    const { localizePath } = useLanguage();

    if (!user?.id) {
        return null;
    }

    const label = getPublicUserLabel(user);
    const handleClick = stopPropagation ? (event: MouseEvent) => event.stopPropagation() : undefined;

    return (
        <Link
            href={getPublicUserHref(user, localizePath)}
            style={{ textDecoration: "none", display: "inline-flex" }}
            title={title}
            onClick={handleClick}
        >
            <div
                style={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    border: "1px solid var(--border)",
                    background: "var(--bg-soft)",
                    color: "var(--azuki)",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: Math.max(11, Math.round(size * 0.46)),
                    fontWeight: 600,
                    flexShrink: 0,
                    ...style,
                }}
            >
                {user.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        src={user.image}
                        alt={label}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                ) : (
                    label.charAt(0).toUpperCase()
                )}
            </div>
        </Link>
    );
}
