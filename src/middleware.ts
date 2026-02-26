import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge Middleware — Prismaを使わずセッションCookieの有無だけで判定
 * (Edge RuntimeではPrisma Clientが動作しないため)
 */
export function middleware(request: NextRequest) {
    // NextAuth v5 のセッションCookie名を確認
    const sessionToken =
        request.cookies.get("authjs.session-token")?.value ||
        request.cookies.get("__Secure-authjs.session-token")?.value;

    if (!sessionToken) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("callbackUrl", request.url);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/editor/:path*"],
};
