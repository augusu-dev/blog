import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
    buildLocalizedPath,
    getLocaleFromPathname,
    getPreferredLocale,
    LANGUAGE_COOKIE_NAME,
    stripLocaleFromPathname,
} from "@/lib/i18n";

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const locale = getLocaleFromPathname(pathname);

    if (!locale) {
        const targetLocale = getPreferredLocale({
            pathname,
            cookieLocale: request.cookies.get(LANGUAGE_COOKIE_NAME)?.value || null,
            acceptLanguage: request.headers.get("accept-language"),
        });
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = buildLocalizedPath(pathname, targetLocale);
        return NextResponse.redirect(redirectUrl);
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-app-locale", locale);

    const sessionToken =
        request.cookies.get("authjs.session-token")?.value ||
        request.cookies.get("__Secure-authjs.session-token")?.value;

    const strippedPath = stripLocaleFromPathname(pathname);
    if ((strippedPath === "/editor" || strippedPath.startsWith("/editor/")) && !sessionToken) {
        const loginUrl = new URL(buildLocalizedPath("/login", locale), request.url);
        loginUrl.searchParams.set("callbackUrl", request.url);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
