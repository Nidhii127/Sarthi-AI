/**
 * app/dashboard/layout.tsx — Main dashboard shell
 *
 * Sidebar (fixed, left) + TopBar (fixed, top) + scrollable content area.
 * All /dashboard/* routes render inside this layout.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase-admin";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  try {
    await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch (err) {
    console.warn("[DashboardLayout] Invalid or expired session cookie, redirecting to /login");
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Fixed sidebar */}
      <Sidebar />

      {/* Fixed top bar — offset by sidebar width */}
      <TopBar />

      {/* Main content — offset for sidebar (w-60 = 240px) on md+ and topbar (h-16 = 64px) */}
      <main className="ml-0 md:ml-60 pt-16 min-h-screen">
        <div className="px-6 sm:px-8 py-8 page-enter max-w-[1440px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
