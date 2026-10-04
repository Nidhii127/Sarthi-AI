import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import StatCard from "@/components/StatCard";
import DataTable, { StatusBadge } from "@/components/DataTable";
import { Store, Plus, CheckCircle2, Clock, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

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

export default async function CatalogPage() {
  // 1. Get authenticated user's UID from verified Firebase session cookie
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    uid = decoded.uid;
  } catch (err) {
    console.warn("[CatalogPage] Invalid or expired session cookie, redirecting to /login:", err);
    redirect("/login");
  }

  // 2. Fetch user's listings from Firestore: /users/{uid}/listings
  let listings: DisplayListing[] = [];
  let fetchError: string | null = null;
  let stats = {
    total: 0,
    live: 0,
    underReview: 0,
    drafts: 0,
  };

  try {
    let snapshot;
    try {
      snapshot = await adminDb
        .collection("users")
        .doc(uid)
        .collection("listings")
        .orderBy("created_at", "desc")
        .get();
    } catch (orderErr) {
      console.warn("[CatalogPage] orderBy query error, falling back to unordered fetch:", orderErr);
      snapshot = await adminDb
        .collection("users")
        .doc(uid)
        .collection("listings")
        .get();
    }

    const rawDocs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Array<{
      id: string;
      title?: string;
      category?: string;
      status?: string;
      created_at?: any;
    }>;

    // Ensure documents are sorted newest first
    rawDocs.sort((a, b) => {
      const timeA = a.created_at?.toMillis?.() ?? (a.created_at ? new Date(a.created_at).getTime() : 0);
      const timeB = b.created_at?.toMillis?.() ?? (b.created_at ? new Date(b.created_at).getTime() : 0);
      return timeB - timeA;
    });

    listings = rawDocs.map((item) => {
      let createdOn = "—";
      if (item.created_at) {
        const dateObj = typeof item.created_at.toDate === "function"
          ? item.created_at.toDate()
          : new Date(item.created_at);

        if (!isNaN(dateObj.getTime())) {
          createdOn = dateObj.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
        }
      }

      return {
        id: item.id,
        product: item.title || "Untitled Product",
        category: item.category || "—",
        createdOn,
        status: formatStatus(item.status || "live"),
        href: `/dashboard/catalog/${item.id}`,
      };
    });

    const liveCount = rawDocs.filter((d) => (d.status ?? "").toLowerCase() === "live").length;
    const reviewCount = rawDocs.filter(
      (d) => (d.status ?? "").toLowerCase() === "under_review" || (d.status ?? "").toLowerCase() === "under review"
    ).length;
    const draftCount = rawDocs.filter((d) => (d.status ?? "").toLowerCase() === "draft").length;

    stats = {
      total: rawDocs.length,
      live: liveCount,
      underReview: reviewCount,
      drafts: draftCount,
    };
  } catch (err: any) {
    console.error("[CatalogPage] Error reading listings from Firestore:", err);
    fetchError = err?.message || "Failed to load listings from Firestore";
  }

  return (
    <div>
      {/* 1. Clean, Compact Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7 sm:mb-8">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#17181c] tracking-tight">
            Catalog Uploads
          </h1>
          <p className="text-[#6c7080] text-sm mt-1">
            Create and manage your product listings
          </p>
        </div>

        {/* Refined Add Product CTA */}
        <Link
          id="add-product-btn"
          href="/dashboard/catalog/add"
          className="inline-flex items-center justify-center gap-2 bg-[#e11b4c] hover:bg-[#c9143f] active:bg-[#b01037] text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-all duration-150 shadow-sm hover:shadow active:scale-[0.99] self-start sm:self-auto shrink-0"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span className="font-display font-semibold">Add Product</span>
        </Link>
      </div>

      {/* 2. Cohesive Statistics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8 sm:mb-10">
        <StatCard
          title="Listed Products"
          value={String(stats.total)}
          icon={Store}
          iconColor="text-[#e11b4c]"
          iconBg="bg-[#fff0f3]"
        />
        <StatCard
          title="Live"
          value={String(stats.live)}
          subtitle="Visible to buyers"
          icon={CheckCircle2}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <StatCard
          title="Under Review"
          value={String(stats.underReview)}
          icon={Clock}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <StatCard
          title="Drafts"
          value={String(stats.drafts)}
          subtitle="Incomplete"
          icon={FileText}
          iconColor="text-[#8c8f9c]"
          iconBg="bg-[#f4f4f7]"
        />
      </div>

      {/* 3. Products Section */}
      <section className="space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-0.5">
          <div>
            <h2 className="font-display text-lg font-bold text-[#17181c] tracking-tight">
              Your Products
            </h2>
            <p className="text-xs sm:text-sm text-[#6c7080] mt-0.5">
              Manage your product listings
            </p>
          </div>
          <span className="text-xs font-medium text-[#8c8f9c] self-start sm:self-auto mt-1 sm:mt-0">
            {stats.total === 0
              ? "0 products"
              : `Showing ${listings.length} of ${stats.total} ${
                  stats.total === 1 ? "product" : "products"
                }`}
          </span>
        </div>

        {fetchError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-sm text-red-600">
            <p className="font-semibold text-red-800">Failed to load listings</p>
            <p className="mt-1">{fetchError}</p>
          </div>
        ) : (
          <DataTable<DisplayListing>
            columns={[
              {
                key: "id",
                header: "Listing ID",
                className: "font-mono text-xs font-medium text-[#6c7080]",
              },
              {
                key: "product",
                header: "Product",
                className: "font-medium text-[#17181c]",
              },
              { key: "category", header: "Category" },
              { key: "createdOn", header: "Created On" },
              {
                key: "status",
                header: "Status",
                render: (val) => (
                  <StatusBadge
                    label={String(val)}
                    variant={STATUS_MAP[String(val)] ?? "neutral"}
                  />
                ),
              },
            ]}
            rows={listings}
            emptyMessage="No product listings found yet. Click 'Add Product' above to create your first listing."
          />
        )}
      </section>
    </div>
  );
}
