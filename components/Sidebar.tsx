"use client";

/**
 * components/Sidebar.tsx — Dark nav sidebar
 *
 * Uses usePathname to highlight the active route.
 * Per AGENTS.md §13: Catalog Uploads is the only real section — highlighted distinctly.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingBag,
  RefreshCcw,
  Tag,
  Shield,
  Package,
  CreditCard,
  Store,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Orders", href: "/dashboard/orders", icon: ShoppingBag },
  { label: "Returns", href: "/dashboard/returns", icon: RefreshCcw },
  { label: "Pricing", href: "/dashboard/pricing", icon: Tag },
  { label: "Claims", href: "/dashboard/claims", icon: Shield },
  { label: "Inventory", href: "/dashboard/inventory", icon: Package },
  { label: "Payments", href: "/dashboard/payments", icon: CreditCard },
] as const;

const CATALOG_ITEM = {
  label: "Catalog Uploads",
  href: "/dashboard/catalog",
  icon: Store,
};

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="fixed inset-y-0 left-0 w-60 flex flex-col z-40"
      style={{ backgroundColor: "var(--color-sidebar-bg)" }}>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/5">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600 shadow-lg shadow-indigo-600/30 flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 13L9 5L14 13H4Z" fill="white" fillOpacity="0.9" />
            <circle cx="9" cy="5" r="2" fill="white" />
          </svg>
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-none">Sarthi AI</p>
          <p className="text-slate-500 text-xs mt-0.5">Seller Hub</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 py-1.5 text-xs font-semibold text-slate-600 uppercase tracking-widest">
          Store
        </p>
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                active
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              <Icon
                size={17}
                className={`flex-shrink-0 ${
                  active ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                }`}
              />
              {label}
            </Link>
          );
        })}

        {/* Divider before Catalog */}
        <div className="pt-3 pb-1">
          <p className="px-3 py-1.5 text-xs font-semibold text-slate-600 uppercase tracking-widest">
            Listings
          </p>
        </div>

        {/* Catalog Uploads — primary action, highlighted differently */}
        {(() => {
          const active = isActive(CATALOG_ITEM.href);
          const Icon = CATALOG_ITEM.icon;
          return (
            <Link
              href={CATALOG_ITEM.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 group ${
                active
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-indigo-400 hover:text-indigo-300 hover:bg-indigo-600/10 border border-indigo-500/20"
              }`}
            >
              <Icon size={17} className="flex-shrink-0" />
              {CATALOG_ITEM.label}
              {!active && (
                <span className="ml-auto text-xs bg-indigo-600/20 text-indigo-400 px-1.5 py-0.5 rounded-full">
                  New
                </span>
              )}
            </Link>
          );
        })()}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/5">
        <p className="text-slate-600 text-xs">
          Phase 3 — Mock Dashboard
        </p>
      </div>
    </aside>
  );
}
