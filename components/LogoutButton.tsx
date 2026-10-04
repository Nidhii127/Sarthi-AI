"use client";

import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { LogOut, Loader2 } from "lucide-react";

export default function LogoutButton() {
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      // 1. Clear server-side HttpOnly session cookie
      await fetch("/api/auth/session", { method: "DELETE" });
      // 2. Sign out client-side Firebase Auth instance
      await signOut(auth);
    } catch (err) {
      console.error("[LogoutButton] Error during logout:", err);
    } finally {
      // 3. Hard redirect to /login to flush cache and update middleware
      window.location.href = "/login";
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loggingOut}
      className="flex items-center gap-1.5 ml-2 px-3 py-2 text-xs font-medium text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50"
      title="Logout"
    >
      {loggingOut ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <LogOut size={14} />
      )}
      <span className="hidden sm:inline">Logout</span>
    </button>
  );
}
