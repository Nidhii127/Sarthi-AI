/**
 * proxy.ts — Edge Route Protection
 *
 * Protects /dashboard/* routes by validating the Firebase __session cookie.
 * - Redirects unauthenticated requests from /dashboard/* to /login.
 * - Redirects authenticated requests from /login to /dashboard.
 *
 * Runs on the edge runtime before page rendering.
 * Full cryptographic verification is also enforced in app/dashboard/layout.tsx.
 */

import { type NextRequest, NextResponse } from "next/server";

function isSessionValid(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  try {
    const parts = cookieValue.split(".");
    if (parts.length !== 3) return false;

    // Decode base64url payload
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = atob(base64);
    const payload = JSON.parse(jsonStr);

    const now = Math.floor(Date.now() / 1000);
    // Check expiration
    if (!payload.exp || payload.exp <= now) {
      return false;
    }

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (projectId) {
      if (payload.aud && payload.aud !== projectId) return false;
      if (
        payload.iss &&
        payload.iss !== `https://session.firebase.google.com/${projectId}`
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get("__session")?.value;
  const hasValidSession = isSessionValid(sessionCookie);
  const { pathname } = request.nextUrl;

  // Protect /dashboard routes — redirect to /login if not authenticated
  if (pathname.startsWith("/dashboard") && !hasValidSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from /login to catalog dashboard
  if (pathname === "/login" && hasValidSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/catalog";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files with extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
