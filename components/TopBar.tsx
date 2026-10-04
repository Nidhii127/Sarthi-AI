/**
 * components/TopBar.tsx — Dashboard top navigation bar
 *
 * Displays seller identity and logout in a visually quiet user area,
 * keeping the primary focus on the dashboard content.
 * This is a Server Component — fetches session server-side.
 */

import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import LogoutButton from "@/components/LogoutButton";
import { User } from "lucide-react";

export default async function TopBar() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value;

  let displayName = "Seller";
  let email = "Seller";

  if (sessionCookie) {
    try {
      const decodedUser = await adminAuth.verifySessionCookie(sessionCookie, true);
      displayName = decodedUser.name || decodedUser.email || "Seller";
      email = decodedUser.email || "Seller";
    } catch {
      // Handled by DashboardLayout
    }
  }

  return (
    <header className="fixed top-0 right-0 left-0 md:left-60 h-16 bg-white border-b border-[#e6e6ea] z-30 flex items-center justify-end px-6 sm:px-8">
      {/* Right-side user area — visually quiet and refined */}
      <div className="flex items-center gap-3">
        {/* Seller avatar and info */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#f4f4f6] text-[#585b66] border border-[#e6e6ea]/60">
            <User size={15} />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-[#17181c] leading-none">
              {displayName}
            </p>
            <p className="text-[11px] text-[#8c8f9c] mt-0.5 leading-none">{email}</p>
          </div>
        </div>

        <div className="h-4 w-px bg-[#e6e6ea] hidden sm:block" />

        {/* Logout */}
        <LogoutButton />
      </div>
    </header>
  );
}
