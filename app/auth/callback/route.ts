import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && data?.user) {
      // Upsert the profile since they successfully logged in!
      const fullName = data.user.user_metadata?.full_name || "";
      const email = data.user.email || "";
      
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: data.user.id,
            full_name: fullName,
            email: email,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      
      if (profileError) {
        console.warn("[auth/callback] Profile upsert failed:", profileError.message);
      }

      // Check environment to safely redirect
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // If code exchange failed, redirect to login page with an error parameter
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate session`);
}
