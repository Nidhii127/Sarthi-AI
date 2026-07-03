/**
 * components/TopBar.tsx — Dashboard top navigation bar
 *
 * Displays seller name from Supabase session and a logout button.
 * This is a Server Component — fetches session server-side.
 */

import { createClient } from "@/lib/supabase";
import { signOutAction } from "@/app/(auth)/login/actions";
import { Bell, LogOut, User } from "lucide-react";

export default async function TopBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Try to get name from profiles table, fall back to metadata, then email
  let displayName = "Seller";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    displayName =
      profile?.full_name ||
      user.user_metadata?.full_name ||
      user.email ||
      "Seller";
  }

  // Get first name only for the greeting
  const firstName = displayName.split(" ")[0];

  return (
    <header className="fixed top-0 right-0 left-60 h-16 bg-white border-b border-slate-100 z-30 flex items-center justify-between px-6">
      {/* Greeting */}
      <div>
        <p className="text-slate-900 font-semibold text-sm">
          Welcome back, {firstName} 👋
        </p>
        <p className="text-slate-400 text-xs mt-0.5">
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Notification bell (decorative) */}
        <button
          className="relative flex items-center justify-center w-9 h-9 rounded-xl hover:bg-slate-100 transition-colors text-slate-500"
          title="Notifications"
        >
          <Bell size={17} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full ring-2 ring-white" />
        </button>

        {/* Seller avatar */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-100 ml-1">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700">
            <User size={16} />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-slate-900 leading-none">
              {displayName}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{user?.email ?? "Seller"}</p>
          </div>
        </div>

        {/* Logout */}
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 ml-2 px-3 py-2 text-xs font-medium text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
            title="Logout"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </form>
      </div>
    </header>
  );
}
