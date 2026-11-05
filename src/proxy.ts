import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions, sessionUserFromToken } from "@/lib/server/session";

// Redirect signed-out/revoked sessions before React renders a workspace route.
// A render-time redirect in this Next version also interrupts instant validation.
// Layout/API checks remain authoritative; this is not the sole access check.
export async function proxy(request: NextRequest) {
  try {
    const user = await sessionUserFromToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (user) return NextResponse.next();
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  } catch (error) {
    console.error("Workspace session check failed", error);
    return new NextResponse("Session service unavailable. Check that PostgreSQL is running.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

// Page requests only: never intercept the public login page, APIs, or assets.
export const config = {
  matcher: ["/", "/messages/:path*", "/templates/:path*", "/subscriptions/:path*", "/briefings/:path*", "/watch-turnover/:path*", "/transmissions/:path*", "/audit/:path*", "/drafting/:path*", "/network/:path*", "/admin/:path*", "/profile/:path*"],
};
