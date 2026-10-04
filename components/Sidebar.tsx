"use client";

/**
 * components/Sidebar.tsx — Commerce nav sidebar
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
    <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col z-40 bg-white border-r border-[#e6e6ea]">
      {/* Brand wordmark */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#e6e6ea]">
        <div className="flex items-center justify-center w-9 h-9 rounded-md bg-[#e11b4c] flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 13L9 5L14 13H4Z" fill="white" fillOpacity="0.92" />
            <circle cx="9" cy="5" r="2" fill="white" />
          </svg>
        </div>
        <div className="flex items-center gap-1.5 leading-none">
          <span className="font-display font-extrabold text-[#17181c] text-lg tracking-tight">
            SAARTHI
          </span>
          <span className="font-display font-extrabold text-[#e11b4c] text-lg tracking-tight">
            AI
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 py-2 text-[10px] font-bold text-[#8c8f9c] uppercase tracking-widest">
          Store
        </p>

        {/* Catalog Uploads — first item in Store */}
        {(() => {
          const active = isActive(CATALOG_ITEM.href);
          const Icon = CATALOG_ITEM.icon;
          return (
            <Link
              href={CATALOG_ITEM.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors duration-150 group mb-1 ${
                active
                  ? "bg-[#fff0f3] text-[#e11b4c]"
                  : "text-[#e11b4c] hover:bg-[#fff0f3] border border-[#fecdd3]"
              }`}
            >
              <Icon size={16} className="flex-shrink-0 text-[#e11b4c]" />
              {CATALOG_ITEM.label}
              {!active && (
                <span className="ml-auto text-[10px] bg-[#fff0f3] text-[#e11b4c] border border-[#fecdd3] px-1.5 py-0.5 rounded-md font-bold">
                  New
                </span>
              )}
            </Link>
          );
        })()}

        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-150 group ${
                active
                  ? "bg-[#fff0f3] text-[#e11b4c] font-semibold"
                  : "text-[#585b66] hover:text-[#17181c] hover:bg-[#f7f7f9]"
              }`}
            >
              <Icon
                size={16}
                className={`flex-shrink-0 ${
                  active ? "text-[#e11b4c]" : "text-[#8c8f9c] group-hover:text-[#585b66]"
                }`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[#e6e6ea]">
        <p className="text-[#8c8f9c] text-xs">
          Catalog · Seller Hub
        </p>
      </div>
    </aside>
  );
}
