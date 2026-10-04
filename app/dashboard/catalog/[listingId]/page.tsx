import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { StatusBadge } from "@/components/DataTable";
import {
  ArrowLeft,
  Tag,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  Shirt,
  Ruler,
  Layers,
  IndianRupee,
  Calendar,
  Key,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ listingId: string }>;
}

type SizeChartRow = {
  size: string;
  measurements_cm?: Record<string, string | number>;
  [key: string]: unknown;
};

type VariantRow = {
  size: string;
  color: string;
  stock_qty: number | null;
};

type ConfidenceFlag = {
  field: string;
  confidence: "low" | "medium" | "high";
  reason: string;
  seller_question?: string | null;
};

const STATUS_MAP: Record<string, "success" | "warning" | "neutral"> = {
  Live: "success",
  "Under Review": "warning",
  Draft: "neutral",
  live: "success",
  under_review: "warning",
  draft: "neutral",
};

function formatStatus(status?: string): string {
  if (!status) return "Live";
  if (status.toLowerCase() === "live") return "Live";
  if (status.toLowerCase() === "under_review" || status.toLowerCase() === "under review") return "Under Review";
  if (status.toLowerCase() === "draft") return "Draft";
  return status;
}

export default async function ListingDetailPage({ params }: PageProps) {
  const { listingId } = await params;

  // 1. Authenticate user from Firebase session cookie
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
    console.warn("[ListingDetailPage] Invalid session cookie:", err);
    redirect("/login");
  }

  // 2. Fetch the listing strictly scoped to the authenticated user's UID
  //    /users/{uid}/listings/{listingId} prevents any cross-user access
  let listing: Record<string, any> | null = null;
  let formattedCreatedDate = "—";

  try {
    const docRef = adminDb
      .collection("users")
      .doc(uid)
      .collection("listings")
      .doc(listingId);

    const docSnap = await docRef.get();

    if (docSnap.exists) {
      listing = {
        id: docSnap.id,
        ...docSnap.data(),
      };

      if (listing.created_at) {
        const dateObj =
          typeof listing.created_at.toDate === "function"
            ? listing.created_at.toDate()
            : new Date(listing.created_at);

        if (!isNaN(dateObj.getTime())) {
          formattedCreatedDate = dateObj.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      }
    }
  } catch (fetchErr) {
    console.error("[ListingDetailPage] Error fetching listing:", fetchErr);
  }

  // 3. Not Found / Unauthorized state
  if (!listing) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Link
          href="/dashboard/catalog"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#585b66] hover:text-[#e11b4c] transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          <span>Back to Catalog / कैटलॉग पर वापस जाएं</span>
        </Link>

        <div className="bg-white rounded-lg border border-[#e6e6ea] p-10 text-center shadow-sm">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 text-amber-600 mb-4">
            <AlertCircle size={24} />
          </div>
          <h1 className="font-display text-xl font-bold text-[#17181c] mb-2">
            Listing Not Found / लिस्टिंग नहीं मिली
          </h1>
          <p className="text-sm text-[#585b66] max-w-md mx-auto mb-6">
            The requested product listing does not exist or you do not have permission to view it.
          </p>
          <Link
            href="/dashboard/catalog"
            className="inline-flex items-center gap-2 bg-[#e11b4c] hover:bg-[#c9143f] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            <ArrowLeft size={16} />
            <span>Go to Catalog Uploads</span>
          </Link>
        </div>
      </div>
    );
  }

  const attributes: Record<string, string | null> = listing.attributes || {};
  const sizeChart: SizeChartRow[] = Array.isArray(listing.size_chart) ? listing.size_chart : [];
  const variants: VariantRow[] = Array.isArray(listing.variants) ? listing.variants : [];
  const pricing = listing.pricing_inputs || {};
  const keywords: string[] = Array.isArray(listing.title_seo_keywords) ? listing.title_seo_keywords : [];
  const confidenceFlags: ConfidenceFlag[] = Array.isArray(listing.confidence_flags) ? listing.confidence_flags : [];

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Back button */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/dashboard/catalog"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#585b66] hover:text-[#e11b4c] transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Catalog / कैटलॉग पर वापस जाएं</span>
        </Link>

        <div className="flex items-center gap-2 text-xs text-[#8c8f9c]">
          <Key size={13} />
          <span className="font-mono">{listing.id}</span>
        </div>
      </div>

      {/* Main Header Card */}
      <div className="bg-white rounded-lg border border-[#e6e6ea] p-6 mb-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[#fff0f3] text-[#e11b4c] border border-[#fecdd3]">
                {listing.category || "Uncategorized"}
              </span>
              {listing.sub_category && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-[#fafafb] text-[#585b66] border border-[#e6e6ea]">
                  {listing.sub_category}
                </span>
              )}
              <StatusBadge
                label={formatStatus(listing.status)}
                variant={STATUS_MAP[formatStatus(listing.status)] ?? "success"}
              />
            </div>

            <h1 className="font-display text-2xl font-bold text-[#17181c] leading-tight">
              {listing.title || "Untitled Listing"}
            </h1>

            <div className="flex items-center gap-4 text-xs text-[#8c8f9c] mt-3">
              <span className="flex items-center gap-1.5">
                <Calendar size={13} />
                Created {formattedCreatedDate}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Details & Pricing */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Left Column: Description & SEO (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-white rounded-lg border border-[#e6e6ea] p-6 shadow-sm">
            <h2 className="font-display text-base font-bold text-[#17181c] mb-3 flex items-center gap-2">
              <Shirt size={17} className="text-[#e11b4c]" />
              <span>Product Description / उत्पाद विवरण</span>
            </h2>
            <div className="text-sm text-[#17181c] leading-relaxed whitespace-pre-line bg-[#fafafb] p-4 rounded-md border border-[#f0f0f4]">
              {listing.description || "No description provided."}
            </div>

            {keywords.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#f0f0f4]">
                <p className="text-xs font-semibold text-[#585b66] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-[#e11b4c]" />
                  <span>SEO Keywords / कीवर्ड्स</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="text-xs bg-white text-[#585b66] px-2.5 py-1 rounded-md border border-[#e6e6ea]"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Product Attributes */}
          <div className="bg-white rounded-lg border border-[#e6e6ea] p-6 shadow-sm">
            <h2 className="font-display text-base font-bold text-[#17181c] mb-4 flex items-center gap-2">
              <Tag size={17} className="text-[#e11b4c]" />
              <span>Attributes / विशेषताएँ</span>
            </h2>

            {Object.keys(attributes).length === 0 ? (
              <p className="text-sm text-[#8c8f9c]">No specific attributes recorded.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(attributes).map(([key, val]) => (
                  <div
                    key={key}
                    className="p-3 bg-[#fafafb] rounded-md border border-[#f0f0f4]"
                  >
                    <p className="text-[11px] font-semibold text-[#8c8f9c] uppercase tracking-wider capitalize">
                      {key.replace(/_/g, " ")}
                    </p>
                    <p className="text-sm font-medium text-[#17181c] mt-0.5 capitalize">
                      {val ? String(val) : "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Pricing & Logistics (1 col) */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-[#e6e6ea] p-6 shadow-sm">
            <h2 className="font-display text-base font-bold text-[#17181c] mb-4 flex items-center gap-2">
              <IndianRupee size={17} className="text-[#e11b4c]" />
              <span>Pricing & Tax / मूल्य और कर</span>
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-[#fff0f3] rounded-md border border-[#fecdd3]">
                <span className="text-xs font-semibold text-[#585b66]">Seller Price</span>
                <span className="font-display text-base font-bold text-[#e11b4c]">
                  {pricing.seller_price != null ? `₹${pricing.seller_price}` : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-[#fafafb] rounded-md border border-[#f0f0f4]">
                <span className="text-xs font-medium text-[#585b66]">MRP</span>
                <span className="text-sm font-semibold text-[#17181c]">
                  {pricing.mrp != null ? `₹${pricing.mrp}` : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-[#fafafb] rounded-md border border-[#f0f0f4]">
                <span className="text-xs font-medium text-[#585b66]">Weight</span>
                <span className="text-sm font-medium text-[#17181c]">
                  {pricing.weight_grams != null ? `${pricing.weight_grams} g` : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-[#fafafb] rounded-md border border-[#f0f0f4]">
                <span className="text-xs font-medium text-[#585b66]">GST Rate</span>
                <span className="text-sm font-medium text-[#17181c]">
                  {pricing.gst_percent != null ? `${pricing.gst_percent}%` : "—"}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-[#fafafb] rounded-md border border-[#f0f0f4]">
                <span className="text-xs font-medium text-[#585b66]">HSN Code</span>
                <span className="font-mono text-xs font-medium text-[#17181c]">
                  {pricing.hsn_code ? String(pricing.hsn_code) : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Size Chart & Variants Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Size Chart */}
        <div className="bg-white rounded-lg border border-[#e6e6ea] p-6 shadow-sm">
          <h2 className="font-display text-base font-bold text-[#17181c] mb-3 flex items-center gap-2">
            <Ruler size={17} className="text-[#e11b4c]" />
            <span>Size Chart (cm) / माप तालिका</span>
          </h2>

          {sizeChart.length === 0 ? (
            <p className="text-sm text-[#8c8f9c] py-4 text-center">No standard size chart required for this category.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e6e6ea] bg-[#fafafb]">
                    <th className="px-3 py-2 text-left font-bold text-[#585b66] uppercase">Size</th>
                    {Object.keys(sizeChart[0]?.measurements_cm || {}).map((mKey) => (
                      <th key={mKey} className="px-3 py-2 text-left font-bold text-[#585b66] uppercase">
                        {mKey}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f4]">
                  {sizeChart.map((row, i) => (
                    <tr key={i} className="hover:bg-[#fafafb]">
                      <td className="px-3 py-2.5 font-bold text-[#17181c]">{row.size}</td>
                      {Object.entries(row.measurements_cm || {}).map(([k, val]) => (
                        <td key={k} className="px-3 py-2.5 text-[#585b66]">
                          {val != null ? String(val) : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Variants & Stock */}
        <div className="bg-white rounded-lg border border-[#e6e6ea] p-6 shadow-sm">
          <h2 className="font-display text-base font-bold text-[#17181c] mb-3 flex items-center gap-2">
            <Layers size={17} className="text-[#e11b4c]" />
            <span>Variants & Stock / वेरिएंट और स्टॉक</span>
          </h2>

          {variants.length === 0 ? (
            <p className="text-sm text-[#8c8f9c] py-4 text-center">No variants specified.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e6e6ea] bg-[#fafafb]">
                    <th className="px-3 py-2 text-left font-bold text-[#585b66] uppercase">Size</th>
                    <th className="px-3 py-2 text-left font-bold text-[#585b66] uppercase">Color</th>
                    <th className="px-3 py-2 text-left font-bold text-[#585b66] uppercase">Stock Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f4]">
                  {variants.map((v, i) => (
                    <tr key={i} className="hover:bg-[#fafafb]">
                      <td className="px-3 py-2.5 font-semibold text-[#17181c]">{v.size}</td>
                      <td className="px-3 py-2.5 text-[#585b66]">{v.color}</td>
                      <td className="px-3 py-2.5 font-mono text-[#17181c]">
                        {v.stock_qty != null ? v.stock_qty : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confidence & Verification Flags */}
      {confidenceFlags.length > 0 && (
        <div className="bg-white rounded-lg border border-[#e6e6ea] p-6 mb-6 shadow-sm">
          <h2 className="font-display text-base font-bold text-[#17181c] mb-3 flex items-center gap-2">
            <CheckCircle2 size={17} className="text-[#e11b4c]" />
            <span>Verification Notes / सत्यापन विवरण</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {confidenceFlags.map((flag, idx) => {
              const badgeStyle =
                flag.confidence === "high"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : flag.confidence === "medium"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-red-50 text-red-700 border-red-200";

              return (
                <div
                  key={idx}
                  className="p-3 rounded-md border border-[#f0f0f4] bg-[#fafafb] flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-[#17181c] capitalize">
                      {flag.field.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${badgeStyle}`}
                    >
                      {flag.confidence}
                    </span>
                  </div>
                  <p className="text-xs text-[#585b66]">{flag.reason}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="flex justify-start">
        <Link
          href="/dashboard/catalog"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#585b66] hover:text-[#17181c] bg-white border border-[#e6e6ea] px-4 py-2.5 rounded-lg transition-colors shadow-sm"
        >
          <ArrowLeft size={16} />
          <span>Back to Catalog Uploads</span>
        </Link>
      </div>
    </div>
  );
}
