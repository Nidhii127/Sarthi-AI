/**
 * lib/supabase.ts — Server-side Supabase client
 *
 * Uses @supabase/ssr to create a cookie-based client safe for use in
 * Server Components, Server Actions, and Route Handlers.
 *
 * Environment variables used (server-side, not exposed to browser):
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *
 * NOTE: One-time DB setup required — run scripts/setup-db.sql in Supabase SQL Editor.
 */

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            );
          } catch {
            // Called from a Server Component — the middleware handles session refresh
          }
        },
      },
    }
  );
}

/**
 * Service-role client — server-side only, bypasses RLS.
 * NEVER import this in client components or expose to the browser.
 */
export function createServiceClient() {
  return createSupabaseAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
