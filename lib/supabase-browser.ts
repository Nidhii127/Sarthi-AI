/**
 * lib/supabase-browser.ts — Browser-side Supabase client
 *
 * Uses createBrowserClient from @supabase/ssr. Safe to import in Client Components.
 *
 * Environment variables used (NEXT_PUBLIC_* — exposed to browser intentionally):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
