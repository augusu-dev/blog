import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const isEditor = req.nextUrl.pathname.startsWith("/editor");
    const isLoggedIn = !!req.auth;

    if (isEditor && !isLoggedIn) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/editor/:path*"],
};
