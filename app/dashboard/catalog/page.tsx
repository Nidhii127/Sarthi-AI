"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import StatCard from "@/components/StatCard";
import DataTable, { StatusBadge } from "@/components/DataTable";
import { Store, PlusCircle, CheckCircle2, Clock, FileText } from "lucide-react";

// Mock catalog listings — used as fallback/seed if no real database entries exist per AGENTS.md §15
const MOCK_LISTINGS = [
  { id: "LST-028", product: "Indigo Cotton Kurti", category: "Kurti", createdOn: "26 Jun 2026", status: "Live" },
  { id: "LST-027", product: "Women's Striped T-shirt", category: "T-shirt", createdOn: "25 Jun 2026", status: "Live" },
  { id: "LST-026", product: "Black Slim Pant", category: "Pant", createdOn: "24 Jun 2026", status: "Live" },
  { id: "LST-025", product: "Floral Maxi Dress", category: "Maxi Dress", createdOn: "23 Jun 2026", status: "Under Review" },
  { id: "LST-024", product: "Men's Linen Shirt", category: "Shirt", createdOn: "22 Jun 2026", status: "Live" },
  { id: "LST-023", product: "Premium Silk Saree", category: "Saree", createdOn: "21 Jun 2026", status: "Under Review" },
  { id: "LST-022", product: "Designer Kurta (Men)", category: "Kurta", createdOn: "20 Jun 2026", status: "Draft" },
  { id: "LST-021", product: "Leggings Set — Navy", category: "Leggings", createdOn: "19 Jun 2026", status: "Live" },
];

type DisplayListing = {
  id: string;
  product: string;
  category: string;
  createdOn: string;
  status: string;
  [key: string]: unknown;
};

const STATUS_MAP: Record<string, "success" | "warning" | "neutral"> = {
  Live: "success",
  "Under Review": "warning",
  Draft: "neutral",
  live: "success",
  under_review: "warning",
  draft: "neutral",
};

function formatStatus(status: string): string {
  if (status === "live") return "Live";
  if (status === "under_review") return "Under Review";
  if (status === "draft") return "Draft";
  return status;
}

export default function CatalogPage() {
  const router = useRouter();
  const [listings, setListings] = useState<DisplayListing[]>([]);
  const [loading, setLoading] = useState(true);

  // Stats derived dynamically
  const [stats, setStats] = useState({
    total: 28,
    live: 25,
    underReview: 3,
    drafts: 2,
  });

  useEffect(() => {
    async function fetchListings() {
      try {
        const supabase = createClient();
        
        // 1. Get authenticated user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          console.warn("[CatalogPage] User not authenticated, falling back to mocks");
          useFallback();
          return;
        }

        // 2. Query user listings from DB
        const { data, error } = await supabase
          .from("listings")
          .select("*")
          .eq("seller_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("[CatalogPage] DB fetch error, falling back to mocks:", error.message);
          useFallback();
          return;
        }

        if (!data || data.length === 0) {
          console.info("[CatalogPage] No real listings found in DB, seeding view with mock listings");
          useFallback();
          return;
        }

        // 3. Map database entries to DisplayListing format
        const formatted: DisplayListing[] = data.map((item) => {
          const createdOn = new Date(item.created_at).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
          
          return {
            id: `LST-${item.id.slice(0, 4).toUpperCase()}`,
            product: item.title,
            category: item.category,
            createdOn,
            status: formatStatus(item.status || "live"),
          };
        });

        setListings(formatted);

        // 4. Calculate dynamic stats from DB entries
        const liveCount = data.filter((item) => item.status === "live" || item.status === "Live").length;
        const reviewCount = data.filter((item) => item.status === "under_review" || item.status === "Under Review").length;
        const draftCount = data.filter((item) => item.status === "draft" || item.status === "Draft").length;

        setStats({
          total: data.length,
          live: liveCount,
          underReview: reviewCount,
          drafts: draftCount,
        });

      } catch (err) {
        console.error("[CatalogPage] Unexpected error fetching listings:", err);
        useFallback();
      } finally {
        setLoading(false);
      }
    }

    function useFallback() {
      setListings(MOCK_LISTINGS);
      setStats({
        total: 28,
        live: 25,
        underReview: 3,
        drafts: 2,
      });
    }

    fetchListings();
  }, []);

  return (
    <div>
      {/* Header with Add Product button */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Catalog Uploads</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Create and manage your product listings
          </p>
        </div>

        {/* Add Product — navigates to Phase 4 input capture screen */}
        <button
          id="add-product-btn"
          onClick={() => router.push("/dashboard/catalog/add")}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all duration-150 shadow-lg shadow-indigo-600/25 hover:shadow-indigo-500/30 hover:-translate-y-0.5"
        >
          <PlusCircle size={17} />
          Add Product
        </button>
      </div>

      {/* Sarthi AI live banner */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
        <span className="text-2xl mt-0.5">🎙️</span>
        <div>
          <p className="text-indigo-900 font-semibold text-sm">
            Sarthi AI is live
          </p>
          <p className="text-indigo-600 text-sm mt-0.5">
            Speak in Hindi or Hinglish, upload a photo, and get a complete listing in seconds.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Listed Products" value={loading ? "..." : String(stats.total)} icon={Store} iconColor="text-indigo-600" />
        <StatCard title="Live" value={loading ? "..." : String(stats.live)} subtitle="Visible to buyers" icon={CheckCircle2} iconColor="text-emerald-600" />
        <StatCard title="Under Review" value={loading ? "..." : String(stats.underReview)} icon={Clock} iconColor="text-amber-600" />
        <StatCard title="Drafts" value={loading ? "..." : String(stats.drafts)} subtitle="Incomplete" icon={FileText} iconColor="text-slate-500" />
      </div>

      {/* Recent listings table */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Recent Listings</h2>
        <span className="text-xs text-slate-400">
          {loading ? "Loading..." : `Showing ${listings.length} of ${stats.total}`}
        </span>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-sm text-slate-400">
          Loading listings...
        </div>
      ) : (
        <DataTable<DisplayListing>
          columns={[
            { key: "id", header: "Listing ID", className: "font-mono text-xs font-medium text-slate-600" },
            { key: "product", header: "Product", className: "font-medium text-slate-800" },
            { key: "category", header: "Category" },
            { key: "createdOn", header: "Created On" },
            {
              key: "status",
              header: "Status",
              render: (val) => (
                <StatusBadge label={String(val)} variant={STATUS_MAP[String(val)] ?? "neutral"} />
              ),
            },
          ]}
          rows={listings}
        />
      )}
    </div>
  );
}
