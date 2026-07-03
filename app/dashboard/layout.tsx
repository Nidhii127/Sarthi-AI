/**
 * app/dashboard/layout.tsx — Main dashboard shell
 *
 * Sidebar (fixed, left) + TopBar (fixed, top) + scrollable content area.
 * All /dashboard/* routes render inside this layout.
 */

import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-content-bg)" }}>
      {/* Fixed sidebar */}
      <Sidebar />

      {/* Fixed top bar — offset by sidebar width */}
      <TopBar />

      {/* Main content — offset for sidebar (w-60 = 240px) and topbar (h-16 = 64px) */}
      <main className="ml-60 pt-16 min-h-screen">
        <div className="p-6 page-enter">{children}</div>
      </main>
    </div>
  );
}
