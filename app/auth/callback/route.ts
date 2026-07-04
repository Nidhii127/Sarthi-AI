import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // Determine the correct base URL for redirects.
  // In production we always use NEXT_PUBLIC_SITE_URL so cookies are set on the
  // canonical domain (not a Vercel preview URL or the x-forwarded-host value).
  const baseUrl =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : process.env.NEXT_PUBLIC_SITE_URL!;

  if (!code) {
    console.warn("[auth/callback] No code param — redirecting to login");
    return NextResponse.redirect(`${baseUrl}/login?error=auth_failed`);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data?.user) {
      console.error("[auth/callback] exchangeCodeForSession error:", error?.message);
      return NextResponse.redirect(`${baseUrl}/login?error=auth_failed`);
    }

    // Upsert seller profile on every successful login.
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: data.user.id,
          full_name: data.user.user_metadata?.full_name ?? "",
          email: data.user.email ?? "",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (profileError) {
      // Non-fatal: auth succeeded, profile upsert failed — log and continue.
      console.warn("[auth/callback] Profile upsert failed:", profileError.message);
    }

    return NextResponse.redirect(`${baseUrl}/dashboard`);
  } catch (err) {
    console.error("[auth/callback] Unexpected error:", err);
    return NextResponse.redirect(`${baseUrl}/login?error=auth_failed`);
  }
}
