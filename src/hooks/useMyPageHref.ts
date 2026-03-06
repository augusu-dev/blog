"use client";

import { useSession } from "next-auth/react";

export function useMyPageHref(): string {
    const { status } = useSession();
    return status === "authenticated" ? "/user/me" : "/settings";
}
