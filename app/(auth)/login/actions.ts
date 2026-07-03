"use server";

/**
 * app/(auth)/login/actions.ts — Server Actions for email OTP auth
 *
 * SETUP REQUIRED:
 *   1. In Supabase dashboard → Authentication → Providers → Email → Enable
 *   2. Enable "Confirm email" or use OTP flow cleanly on free tier.
 */

import { createClient } from "@/lib/supabase";
import { redirect } from "next/navigation";

export type OtpActionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Step 1: Send OTP to an email address.
 * Stores the seller's name in user_metadata so it's available after verification.
 */
export async function sendOtpAction(
  email: string,
  name: string
): Promise<OtpActionResult> {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, error: "Please enter a valid email address." };
  }
  if (!name.trim() || name.trim().length < 2) {
    return { success: false, error: "Please enter your full name." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: "http://localhost:3000/auth/callback",
        data: { full_name: name.trim() },
      },
    });

    if (error) {
      console.error("[sendOtpAction] Supabase error:", error.message);
      // Surface a user-friendly message
      if (error.message.toLowerCase().includes("rate limit")) {
        return {
          success: false,
          error: "Too many requests. Please wait a minute and try again.",
        };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("[sendOtpAction] Unexpected error:", err);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * Step 2: Verify OTP and complete sign-in.
 * After successful verification, upserts the seller's name into the profiles table.
 */
export async function verifyOtpAction(
  email: string,
  token: string,
  name: string
): Promise<OtpActionResult> {
  if (!token || token.length !== 6) {
    return { success: false, error: "Please enter the 6-digit OTP." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error) {
      console.error("[verifyOtpAction] Supabase error:", error.message);
      if (
        error.message.toLowerCase().includes("invalid") ||
        error.message.toLowerCase().includes("expired")
      ) {
        return {
          success: false,
          error: "Invalid or expired OTP. Please request a new one.",
        };
      }
      return { success: false, error: error.message };
    }

    // Upsert seller profile — stores name for display in dashboard
    if (data.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: data.user.id,
            full_name: name.trim(),
            email,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      if (profileError) {
        // Non-fatal: auth succeeded, profile upsert failed
        console.warn("[verifyOtpAction] Profile upsert failed:", profileError.message);
      }
    }

    return { success: true };
  } catch (err) {
    console.error("[verifyOtpAction] Unexpected error:", err);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

/**
 * Sign out the current user and redirect to /login.
 */
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
