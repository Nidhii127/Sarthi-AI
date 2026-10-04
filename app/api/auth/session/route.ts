import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";

const SESSION_EXPIRY_MS = 5 * 24 * 60 * 60 * 1000; // 5 days in milliseconds
const SESSION_EXPIRY_SEC = 5 * 24 * 60 * 60; // 5 days in seconds
const MAX_AUTH_AGE_SEC = 5 * 60; // 5 minutes

/**
 * POST /api/auth/session
 * Exchange a client Firebase ID token for an HttpOnly session cookie.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const idToken = body.idToken;

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid idToken parameter" },
        { status: 400 }
      );
    }

    // 1. Verify the ID token using Firebase Admin SDK
    const decodedIdToken = await adminAuth.verifyIdToken(idToken);

    // 2. Security check: Ensure token was issued recently
    const authTime = decodedIdToken.auth_time;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - authTime > MAX_AUTH_AGE_SEC) {
      return NextResponse.json(
        { error: "Recent login required. Please sign in again." },
        { status: 401 }
      );
    }

    // 3. Create the session cookie
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY_MS,
    });

    // 4. Set the HttpOnly session cookie on the response
    const response = NextResponse.json({
      status: "success",
      uid: decodedIdToken.uid,
    });

    response.cookies.set("__session", sessionCookie, {
      maxAge: SESSION_EXPIRY_SEC,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    });

    return response;
  } catch (err: any) {
    console.error("[/api/auth/session POST] Error creating session cookie:", err);
    return NextResponse.json(
      {
        error: "Failed to create session",
        details: err?.message || String(err),
      },
      { status: 401 }
    );
  }
}

/**
 * DELETE /api/auth/session
 * Clear the session cookie to securely log out the user server-side.
 */
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("__session")?.value;

    if (sessionCookie) {
      try {
        const decoded = await adminAuth.verifySessionCookie(sessionCookie);
        // Revoke refresh tokens so current session cannot be reused
        await adminAuth.revokeRefreshTokens(decoded.sub);
      } catch {
        // Token might already be expired or invalid, proceed to clear cookie
      }
    }

    const response = NextResponse.json({ status: "logged_out" });
    response.cookies.set("__session", "", {
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    });

    return response;
  } catch (err: any) {
    console.error("[/api/auth/session DELETE] Error clearing session:", err);
    return NextResponse.json(
      { error: "Failed to logout", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/session
 * Inspect current session validity and user claims.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("__session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return NextResponse.json({
      authenticated: true,
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
