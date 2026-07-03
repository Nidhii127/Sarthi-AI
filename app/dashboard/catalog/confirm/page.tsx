"use client";

/**
 * app/dashboard/catalog/confirm/page.tsx — Phase 6: Bilingual Confirmation Screen
 *
 * Receives the AI-generated listing from localStorage (written by add/page.tsx
 * after a successful /api/generate-listing call) and renders every field as an
 * editable form with confidence-level indicators per AGENTS.md §8.
 *
 * Confidence rules (AGENTS.md §8):
 *   high   → field shown plainly, no badge
 *   medium → amber "Please confirm / कृपया पुष्टि करें" badge
 *   low    → red "Needs info" badge + seller_question displayed below the field,
 *            field MUST be non-empty before submit is enabled
 *
 * Bilingual (AGENTS.md §14):
 *   - Field labels: "English / हिंदी" inline
 *   - Seller questions: Hindi first, English subtitle below
 *   - Submit: "List Product / उत्पाद सूचीबद्ध करें"
 *
 * No DB writes — on submit, console.log the final listing (Phase 8 wires DB).
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { type Listing, ALLOWED_CATEGORIES } from "@/lib/schema/listing";
import {
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Tag,
  Package,
  BarChart2,
  Layers,
  Search,
  Plus,
  Trash2,
  Send,
  IndianRupee,
} from "lucide-react";

// ─── LocalStorage key (shared with add/page.tsx) ──────────────────────────────

const LS_KEY = "sarthi_pending_listing";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfidenceLevel = "high" | "medium" | "low";

type ConfidenceFlag = {
  field: string;
  confidence: ConfidenceLevel;
  reason: string;
  seller_question: string | null;
};

/**
 * EditedListing — mirrors Listing but with all numeric values stored as strings
 * so they work cleanly with controlled <input type="number"> elements (avoids
 * NaN-on-empty-string issues). Converted back to numbers in editedListingToFinal().
 */
type EditedListing = {
  category: string;
  sub_category: string;
  title: string;
  description: string;
  attributes: Record<string, string>;
  size_chart: Array<{
    size: string;
    measurements_cm: Record<string, string>;
  }>;
  variants: Array<{
    size: string;
    color: string;
    stock_qty: string; // "" means null/unknown — seller must fill
  }>;
  pricing_inputs: {
    seller_price: string;
    mrp: string;
    weight_grams: string;
    gst_percent: string;
    hsn_code: string;
  };
};

// ─── Bilingual label maps ─────────────────────────────────────────────────────

const HINDI_LABELS: Record<string, string> = {
  // Basic info
  category: "श्रेणी",
  sub_category: "उप-श्रेणी",
  title: "शीर्षक",
  description: "विवरण",
  // Pricing
  seller_price: "विक्रेता मूल्य",
  mrp: "अधिकतम खुदरा मूल्य",
  weight_grams: "वजन (ग्राम)",
  gst_percent: "जीएसटी (%)",
  hsn_code: "एचएसएन कोड",
  // Universal attributes
  fabric: "कपड़ा",
  color: "रंग",
  pattern: "पैटर्न",
  occasion: "अवसर",
  net_quantity: "कुल मात्रा",
  country_of_origin: "उत्पत्ति देश",
  gender: "लिंग",
  // Top attributes
  sleeve_length: "आस्तीन की लंबाई",
  neck_type: "गला प्रकार",
  fit: "फिट",
  // Bottom attributes
  waist_rise: "कमर की ऊंचाई",
  closure: "बंद करने का तरीका",
  waist_type: "कमर प्रकार",
  // Full-body attributes
  length: "लंबाई",
  // Ethnic attributes
  work: "काम / कढ़ाई",
  set_components: "सेट घटक",
  embellishment: "सजावट",
};

function toHindiLabel(key: string): string {
  return HINDI_LABELS[key] ?? "";
}

function toTitleCase(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Returns "English / हिंदी" or just "English" if no Hindi mapping. */
function bilingualLabel(key: string): string {
  const hindi = toHindiLabel(key);
  const english = toTitleCase(key);
  return hindi ? `${english} / ${hindi}` : english;
}

// ─── Path-aware value getter ──────────────────────────────────────────────────
//
// Handles both top-level keys ("title") and nested paths ("pricing_inputs.seller_price").
// Used exclusively for submit-gating — checks whether a field the pipeline flagged as
// "low" confidence has been filled by the seller.
//
// Returns undefined when the path cannot be resolved (path not in EditedListing),
// which is treated as "not filled" for gating purposes.

function getEditedValue(
  fieldPath: string,
  form: EditedListing
): string | undefined {
  const parts = fieldPath.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = form;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  if (current === null || current === undefined) return undefined;
  return String(current);
}

/**
 * Checks whether a given field path or flat field name counts as "filled"
 * in the EditedListing form state. Handles flat flags vs nested schema paths.
 */
function isFieldFilled(fieldPath: string, form: EditedListing): boolean {
  const path = fieldPath.trim();

  // 1. Pricing fields
  if (path === "seller_price" || path === "pricing_inputs.seller_price") {
    const val = form.pricing_inputs.seller_price;
    if (val === undefined || val === null) return false;
    const trimmed = val.trim();
    if (trimmed === "") return false;
    const num = parseFloat(trimmed);
    return !isNaN(num) && num !== 0;
  }
  if (path === "mrp" || path === "pricing_inputs.mrp") {
    const val = form.pricing_inputs.mrp;
    if (val === undefined || val === null) return false;
    const trimmed = val.trim();
    if (trimmed === "") return false;
    const num = parseFloat(trimmed);
    return !isNaN(num) && num !== 0;
  }
  if (path === "weight_grams" || path === "pricing_inputs.weight_grams") {
    const val = form.pricing_inputs.weight_grams;
    if (val === undefined || val === null) return false;
    const trimmed = val.trim();
    if (trimmed === "") return false;
    const num = parseFloat(trimmed);
    return !isNaN(num) && num !== 0;
  }
  if (path === "gst_percent" || path === "pricing_inputs.gst_percent") {
    const val = form.pricing_inputs.gst_percent;
    return val !== undefined && val !== null && val.trim() !== "";
  }
  if (path === "hsn_code" || path === "pricing_inputs.hsn_code") {
    const val = form.pricing_inputs.hsn_code;
    return val !== undefined && val !== null && val.trim() !== "";
  }

  // 2. Stock quantity / variants
  if (path === "stock_qty" || path === "variants.stock_qty") {
    if (form.variants.length === 0) return false;
    return form.variants.every(
      (v) => v.stock_qty !== undefined && v.stock_qty.trim() !== ""
    );
  }

  // 3. Size measurements / size chart
  if (path === "size_measurements" || path === "size_chart") {
    if (form.size_chart.length === 0) {
      // Saree has no size chart, so considered filled by default
      return true;
    }
    return form.size_chart.every((row) => {
      const cells = Object.values(row.measurements_cm);
      if (cells.length === 0) return false;
      return cells.every(
        (c) => c !== undefined && c.trim() !== "" && c.trim() !== "0"
      );
    });
  }

  // 4. Attributes (supports e.g. "fabric" ↔ "attributes.fabric")
  const attrKey = path.startsWith("attributes.")
    ? path.replace("attributes.", "")
    : path;
  if (attrKey in form.attributes) {
    const val = form.attributes[attrKey];
    return val !== undefined && val.trim() !== "";
  }

  // 5. Direct top-level fields (category, sub_category, title, description)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const directVal = (form as any)[path];
  if (directVal !== undefined) {
    return String(directVal).trim() !== "";
  }

  return false;
}

// ─── Listing ↔ EditedListing converters ──────────────────────────────────────

function listingToEditedListing(listing: Listing): EditedListing {
  return {
    category: listing.category,
    sub_category: listing.sub_category,
    title: listing.title,
    description: listing.description,
    attributes: Object.fromEntries(
      Object.entries(listing.attributes).map(([k, v]) => [k, v ?? ""])
    ),
    size_chart: listing.size_chart.map((row) => ({
      size: row.size,
      measurements_cm: Object.fromEntries(
        Object.entries(row.measurements_cm).map(([k, v]) => [k, String(v)])
      ),
    })),
    variants: listing.variants.map((v) => ({
      size: v.size,
      color: v.color,
      // null stock_qty → "" so seller sees an empty field (not 0)
      stock_qty: v.stock_qty === null ? "" : String(v.stock_qty),
    })),
    pricing_inputs: {
      seller_price:
        listing.pricing_inputs.seller_price === null
          ? ""
          : String(listing.pricing_inputs.seller_price),
      mrp:
        listing.pricing_inputs.mrp === null
          ? ""
          : String(listing.pricing_inputs.mrp),
      weight_grams:
        listing.pricing_inputs.weight_grams === null
          ? ""
          : String(listing.pricing_inputs.weight_grams),
      gst_percent:
        listing.pricing_inputs.gst_percent === null
          ? ""
          : String(listing.pricing_inputs.gst_percent),
      hsn_code:
        listing.pricing_inputs.hsn_code === null
          ? ""
          : String(listing.pricing_inputs.hsn_code),
    },
  };
}

/** Converts the edited (string-typed) form back to a properly-typed Listing for output. */
function editedListingToFinal(
  edited: EditedListing,
  original: Listing
): Listing {
  return {
    ...original,
    category: edited.category as (typeof ALLOWED_CATEGORIES)[number],
    sub_category: edited.sub_category,
    title: edited.title,
    description: edited.description,
    attributes: Object.fromEntries(
      Object.entries(edited.attributes).map(([k, v]) => [k, v || null])
    ),
    size_chart: edited.size_chart.map((row) => ({
      size: row.size,
      measurements_cm: Object.fromEntries(
        Object.entries(row.measurements_cm).map(([k, v]) => [k, v])
      ),
    })),
    variants: edited.variants.map((v) => ({
      size: v.size,
      color: v.color,
      stock_qty: v.stock_qty === "" ? null : parseInt(v.stock_qty, 10),
    })),
    pricing_inputs: {
      seller_price:
        edited.pricing_inputs.seller_price === ""
          ? null
          : parseFloat(edited.pricing_inputs.seller_price),
      mrp:
        edited.pricing_inputs.mrp === ""
          ? null
          : parseFloat(edited.pricing_inputs.mrp),
      weight_grams:
        edited.pricing_inputs.weight_grams === ""
          ? null
          : parseFloat(edited.pricing_inputs.weight_grams),
      gst_percent:
        edited.pricing_inputs.gst_percent === ""
          ? null
          : parseFloat(edited.pricing_inputs.gst_percent),
      hsn_code:
        edited.pricing_inputs.hsn_code === ""
          ? null
          : edited.pricing_inputs.hsn_code,
    },
  };
}

// ─── Shared input class builder ───────────────────────────────────────────────

function inputCls(isLowConfidence: boolean, extra = ""): string {
  const base =
    "w-full text-sm text-slate-800 border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent transition-all";
  const variant = isLowConfidence
    ? "border-red-300 bg-red-50/40 focus:ring-red-400 placeholder-red-300"
    : "border-slate-200 bg-slate-50 hover:border-slate-300 focus:ring-indigo-400";
  return [base, variant, extra].filter(Boolean).join(" ");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceBadge({ flag, isFilled }: { flag: ConfidenceFlag | undefined; isFilled?: boolean }) {
  if (!flag || flag.confidence === "high" || isFilled) return null;

  if (flag.confidence === "medium") {
    return (
      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0">
        <AlertTriangle size={10} />
        Please confirm / कृपया पुष्टि करें
      </span>
    );
  }

  // low
  return (
    <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0">
      <AlertCircle size={10} />
      Needs info / जानकारी चाहिए
    </span>
  );
}

/**
 * Renders the seller question for low-confidence fields.
 * Hindi first (per AGENTS.md §14), English subtitle below.
 */
function SellerQuestion({ flag, isFilled }: { flag: ConfidenceFlag | undefined; isFilled?: boolean }) {
  if (!flag || flag.confidence !== "low" || !flag.seller_question || isFilled) return null;
  return (
    <div className="mt-2 bg-red-50 border-l-2 border-red-400 pl-3 pr-3 py-2.5 rounded-r-lg">
      <p className="text-sm text-red-800 font-medium leading-snug">
        {flag.seller_question}
      </p>
      <p className="text-xs text-red-500 mt-1">
        Please fill this field to continue / इस फ़ील्ड को भरना ज़रूरी है
      </p>
    </div>
  );
}

function FieldRow({
  fieldKey,
  flag,
  isFilled = false,
  children,
}: {
  fieldKey: string;
  flag: ConfidenceFlag | undefined;
  isFilled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <label
          htmlFor={`field-${fieldKey.replace(/\./g, "-")}`}
          className="text-sm font-semibold text-slate-700"
        >
          {bilingualLabel(fieldKey)}
        </label>
        <ConfidenceBadge flag={flag} isFilled={isFilled} />
      </div>
      {children}
      <SellerQuestion flag={flag} isFilled={isFilled} />
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-50">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        </div>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </section>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function ConfirmPage() {
  const router = useRouter();

  const [originalListing, setOriginalListing] = useState<Listing | null>(null);
  const [form, setForm] = useState<EditedListing | null>(null);
  const [confidenceMap, setConfidenceMap] = useState<
    Record<string, ConfidenceFlag>
  >({});
  const [notFound, setNotFound] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasCalculatedMRP, setHasCalculatedMRP] = useState(false);

  // ── Read listing from localStorage on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) {
        setNotFound(true);
        return;
      }
      const parsed = JSON.parse(raw) as Listing;

      // Basic sanity check — must at least have a category
      if (!parsed?.category) {
        setNotFound(true);
        return;
      }

      setOriginalListing(parsed);
      setForm(listingToEditedListing(parsed));

      // Build lookup map with normalized paths: field path ↔ ConfidenceFlag
      const map: Record<string, ConfidenceFlag> = {};
      for (const flag of parsed.confidence_flags ?? []) {
        const fieldName = flag.field.trim();
        map[fieldName] = flag;

        // Map pricing fields
        if (fieldName === "seller_price") map["pricing_inputs.seller_price"] = flag;
        if (fieldName === "pricing_inputs.seller_price") map["seller_price"] = flag;

        if (fieldName === "mrp") map["pricing_inputs.mrp"] = flag;
        if (fieldName === "pricing_inputs.mrp") map["mrp"] = flag;

        if (fieldName === "weight_grams") map["pricing_inputs.weight_grams"] = flag;
        if (fieldName === "pricing_inputs.weight_grams") map["weight_grams"] = flag;

        if (fieldName === "gst_percent") map["pricing_inputs.gst_percent"] = flag;
        if (fieldName === "pricing_inputs.gst_percent") map["gst_percent"] = flag;

        if (fieldName === "hsn_code") map["pricing_inputs.hsn_code"] = flag;
        if (fieldName === "pricing_inputs.hsn_code") map["hsn_code"] = flag;

        // Map size chart fields
        if (fieldName === "size_measurements") map["size_chart"] = flag;
        if (fieldName === "size_chart") map["size_measurements"] = flag;

        // Map stock / variants
        if (fieldName === "stock_qty") map["variants.stock_qty"] = flag;
        if (fieldName === "variants.stock_qty") map["stock_qty"] = flag;

        // Map attributes
        if (
          fieldName === "fabric" ||
          fieldName === "pattern" ||
          fieldName === "color" ||
          fieldName === "occasion" ||
          fieldName === "net_quantity" ||
          fieldName === "country_of_origin" ||
          fieldName === "gender" ||
          fieldName === "sleeve_length" ||
          fieldName === "neck_type" ||
          fieldName === "fit" ||
          fieldName === "waist_rise" ||
          fieldName === "closure" ||
          fieldName === "waist_type" ||
          fieldName === "length" ||
          fieldName === "work" ||
          fieldName === "set_components" ||
          fieldName === "embellishment"
        ) {
          map[`attributes.${fieldName}`] = flag;
        } else if (fieldName.startsWith("attributes.")) {
          const shortName = fieldName.replace("attributes.", "");
          map[shortName] = flag;
        }
      }
      setConfidenceMap(map);
    } catch {
      setNotFound(true);
    }
  }, []);

  // ── Redirect if no data in localStorage ──
  useEffect(() => {
    if (notFound) {
      router.replace("/dashboard/catalog/add");
    }
  }, [notFound, router]);

  // ── Auto-suggest MRP on load/mount ──
  useEffect(() => {
    if (!form || hasCalculatedMRP) return;

    const priceVal = form.pricing_inputs.seller_price;
    const mrpVal = form.pricing_inputs.mrp;

    const priceNum = parseFloat(priceVal);
    if (!isNaN(priceNum) && priceNum > 0) {
      const mrpNum = parseFloat(mrpVal);
      if (!mrpVal || mrpVal.trim() === "" || isNaN(mrpNum) || mrpNum === 0) {
        const suggestedMrp = Math.ceil((priceNum * 1.4) / 10) * 10 - 1;
        setForm((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pricing_inputs: {
              ...prev.pricing_inputs,
              mrp: String(suggestedMrp),
            },
          };
        });
      }
    }
    setHasCalculatedMRP(true);
  }, [form, hasCalculatedMRP]);

  // ── Convenience accessors ──
  const cfFlag = useCallback(
    (field: string): ConfidenceFlag | undefined => confidenceMap[field],
    [confidenceMap]
  );
  const isLow = useCallback(
    (field: string): boolean => {
      const flag = cfFlag(field);
      if (!flag || flag.confidence !== "low") return false;
      return !isFieldFilled(field, form!);
    },
    [cfFlag, form]
  );

  // ── Submit gating ──────────────────────────────────────────────────────────
  //
  // All fields whose confidence_flags entry is "low" must be non-empty before
  // the submit button enables. getEditedValue() uses dot-notation path splitting
  // to reach nested values (e.g. "pricing_inputs.seller_price" → form.pricing_inputs.seller_price).

  const isSubmitEnabled = useCallback((): boolean => {
    if (!form || !originalListing) return false;

    // Check if MRP < seller_price
    const priceVal = parseFloat(form.pricing_inputs.seller_price);
    const mrpVal = parseFloat(form.pricing_inputs.mrp);
    if (!isNaN(priceVal) && !isNaN(mrpVal) && mrpVal < priceVal) {
      return false; // Block submission if MRP is less than price
    }

    const lowFlags = originalListing.confidence_flags.filter(
      (f) => f.confidence === "low"
    );
    console.log("--- checking low-confidence fields ---");
    const results = lowFlags.map((f) => {
      const isFilled = isFieldFilled(f.field, form);
      // Let's obtain the printable value of the field
      const val = f.field.includes("size_measurements") || f.field.includes("size_chart")
        ? "[size chart values]"
        : f.field.includes("stock_qty")
        ? "[variant stock values]"
        : getEditedValue(f.field, form) ?? getEditedValue(`pricing_inputs.${f.field}`, form) ?? getEditedValue(`attributes.${f.field}`, form) ?? "undefined";
      console.log(`Field: "${f.field}", Value: "${val}", IsFilled: ${isFilled}`);
      return isFilled;
    });
    const allFilled = results.every(r => r === true);
    console.log("All low-confidence fields filled:", allFilled);
    return allFilled;
  }, [form, originalListing]);

  const handleSubmit = useCallback(async () => {
    if (!form || !originalListing || !isSubmitEnabled() || isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const final = editedListingToFinal(form, originalListing);

      const response = await fetch("/api/save-listing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(final),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save listing");
      }

      setSaveSuccess(true);
      localStorage.removeItem(LS_KEY);

      setTimeout(() => {
        router.push("/dashboard/catalog");
      }, 2000);
    } catch (err: any) {
      console.error("[ConfirmPage] Save error:", err);
      const errMsg = err.message || "An unexpected error occurred";
      setSaveError(`${errMsg} / लिस्टिंग सहेजने में विफल: कृपया पुनः प्रयास करें।`);
      setIsSaving(false);
    }
  }, [form, originalListing, isSubmitEnabled, isSaving, router]);

  // ── Form field updaters ────────────────────────────────────────────────────

  function setTopField<K extends keyof EditedListing>(
    key: K,
    value: EditedListing[K]
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setPricingField(
    key: keyof EditedListing["pricing_inputs"],
    value: string
  ) {
    setForm((prev) => {
      if (!prev) return prev;
      
      const newPricing = { ...prev.pricing_inputs, [key]: value };
      
      if (key === "seller_price") {
        const priceNum = parseFloat(value);
        if (isNaN(priceNum) || value.trim() === "") {
          newPricing.mrp = "";
        } else {
          const suggestedMrp = Math.ceil((priceNum * 1.4) / 10) * 10 - 1;
          newPricing.mrp = String(suggestedMrp);
        }
      }
      
      return { ...prev, pricing_inputs: newPricing };
    });
  }

  function setAttributeField(key: string, value: string) {
    setForm((prev) =>
      prev
        ? { ...prev, attributes: { ...prev.attributes, [key]: value } }
        : prev
    );
  }

  function setSizeChartRowSize(rowIdx: number, value: string) {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        size_chart: prev.size_chart.map((row, i) =>
          i === rowIdx ? { ...row, size: value } : row
        ),
      };
    });
  }

  function setSizeChartCell(
    rowIdx: number,
    measureKey: string,
    value: string
  ) {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        size_chart: prev.size_chart.map((row, i) =>
          i === rowIdx
            ? {
                ...row,
                measurements_cm: { ...row.measurements_cm, [measureKey]: value },
              }
            : row
        ),
      };
    });
  }

  function setVariantField(
    rowIdx: number,
    key: keyof EditedListing["variants"][number],
    value: string
  ) {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        variants: prev.variants.map((v, i) =>
          i === rowIdx ? { ...v, [key]: value } : v
        ),
      };
    });
  }

  function addVariant() {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            variants: [...prev.variants, { size: "", color: "", stock_qty: "" }],
          }
        : prev
    );
  }

  function removeVariant(idx: number) {
    setForm((prev) =>
      prev
        ? { ...prev, variants: prev.variants.filter((_, i) => i !== idx) }
        : prev
    );
  }

  // ── Loading / redirect states ──────────────────────────────────────────────

  if (notFound || (!form && !notFound)) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-slate-400 text-sm animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!form || !originalListing) return null;

  // ── Derive size chart column keys from first row ──
  const measureKeys =
    form.size_chart.length > 0
      ? Object.keys(form.size_chart[0].measurements_cm)
      : [];

  const submitEnabled = isSubmitEnabled() && !isSaving;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto">

      {/* ── Page header ── */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => router.push("/dashboard/catalog/add")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium group"
          id="back-to-add-btn"
        >
          <ArrowLeft
            size={16}
            className="group-hover:-translate-x-0.5 transition-transform"
          />
          Back
        </button>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900">
          Review Listing / लिस्टिंग की जाँच करें
        </h1>
      </div>

      <p className="text-slate-500 text-sm mb-1">
        Review and edit the generated fields before publishing your product.
      </p>
      <p className="text-slate-400 text-sm mb-6">
        नीचे दी गई जानकारी जाँचें और ज़रूरी बदलाव करें, फिर सबमिट करें।
      </p>

      {/* ── Error & Success Banners ── */}
      {saveSuccess && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm flex items-start gap-2.5 animate-fadeIn">
          <CheckCircle2 className="text-emerald-500 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-semibold text-emerald-900">Listing saved successfully! Redirecting...</p>
            <p className="text-xs text-emerald-600 mt-0.5">लिस्टिंग सफलतापूर्वक सहेज ली गई है! 2 सेकंड में वापस भेजा जा रहा है...</p>
          </div>
        </div>
      )}

      {saveError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-sm flex items-start gap-2.5 animate-fadeIn">
          <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-semibold text-red-900">Failed to save listing / लिस्टिंग सहेजने में विफल</p>
            <p className="text-xs text-red-600 mt-1">{saveError}</p>
          </div>
        </div>
      )}

      {/* ── Confidence legend ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6 px-4 py-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
        <span className="text-slate-500 font-semibold">Confidence:</span>
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <CheckCircle2 size={12} className="text-emerald-500" />
          High — AI is confident, just review
        </span>
        <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
          <AlertTriangle size={10} />
          Medium — please confirm
        </span>
        <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5 font-medium">
          <AlertCircle size={10} />
          Low — answer required to submit
        </span>
      </div>

      <div className="space-y-6">

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 1 — Basic Info
        ════════════════════════════════════════════════════════════════════ */}
        <SectionCard icon={Package} title="Basic Info / मूल जानकारी">

          {/* Category */}
          <FieldRow fieldKey="category" flag={cfFlag("category")} isFilled={isFieldFilled("category", form)}>
            <select
              id="field-category"
              value={form.category}
              onChange={(e) => setTopField("category", e.target.value)}
              className={inputCls(isLow("category"))}
            >
              {ALLOWED_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </FieldRow>

          {/* Sub-category */}
          <FieldRow fieldKey="sub_category" flag={cfFlag("sub_category")} isFilled={isFieldFilled("sub_category", form)}>
            <input
              id="field-sub_category"
              type="text"
              value={form.sub_category}
              onChange={(e) => setTopField("sub_category", e.target.value)}
              className={inputCls(isLow("sub_category"))}
              placeholder="e.g. Women's Ethnic Wear"
            />
          </FieldRow>

          {/* Title */}
          <FieldRow fieldKey="title" flag={cfFlag("title")} isFilled={isFieldFilled("title", form)}>
            <input
              id="field-title"
              type="text"
              value={form.title}
              onChange={(e) => setTopField("title", e.target.value)}
              className={inputCls(isLow("title"))}
              placeholder="Product listing title"
              maxLength={150}
            />
            <p className="text-xs text-slate-400 pl-1">
              {form.title.length}/150 characters
            </p>
          </FieldRow>

          {/* Description */}
          <FieldRow fieldKey="description" flag={cfFlag("description")} isFilled={isFieldFilled("description", form)}>
            <textarea
              id="field-description"
              value={form.description}
              onChange={(e) => setTopField("description", e.target.value)}
              rows={5}
              className={`${inputCls(isLow("description"))} resize-none`}
              placeholder="Product description"
            />
          </FieldRow>
        </SectionCard>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 2 — Attributes
        ════════════════════════════════════════════════════════════════════ */}
        {Object.keys(form.attributes).length > 0 && (
          <SectionCard icon={Tag} title="Attributes / विशेषताएं">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {Object.entries(form.attributes).map(([attrKey, attrVal]) => (
                <FieldRow
                  key={attrKey}
                  fieldKey={attrKey}
                  flag={cfFlag(attrKey)}
                  isFilled={isFieldFilled(attrKey, form)}
                >
                  <input
                    id={`field-attr-${attrKey}`}
                    type="text"
                    value={attrVal}
                    onChange={(e) => setAttributeField(attrKey, e.target.value)}
                    className={inputCls(isLow(attrKey))}
                    placeholder={toTitleCase(attrKey)}
                  />
                </FieldRow>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 3 — Size Chart
        ════════════════════════════════════════════════════════════════════ */}
        {form.size_chart.length > 0 && (
          <SectionCard icon={BarChart2} title="Size Chart / साइज़ चार्ट">
            <p className="text-xs text-slate-400 -mt-2">
              Measurements in inches (cm in brackets) / माप इंच में हैं (cm कोष्ठक में)
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 w-24">
                      Size / साइज़
                    </th>
                    {measureKeys.map((mk) => (
                      <th
                        key={mk}
                        className="text-left px-4 py-3 text-xs font-semibold text-slate-600"
                      >
                        {toTitleCase(mk)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.size_chart.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition-colors"
                    >
                      {/* Size label cell */}
                      <td className="px-3 py-2">
                        <input
                          id={`size-chart-${rowIdx}-size`}
                          type="text"
                          value={row.size}
                          onChange={(e) =>
                            setSizeChartRowSize(rowIdx, e.target.value)
                          }
                          className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-center font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
                        />
                      </td>
                      {/* Measurement cells (dynamic columns) */}
                      {measureKeys.map((mk) => (
                        <td key={mk} className="px-3 py-2">
                          <input
                            id={`size-chart-${rowIdx}-${mk}`}
                            type="text"
                            value={row.measurements_cm[mk] ?? ""}
                            onChange={(e) =>
                              setSizeChartCell(rowIdx, mk, e.target.value)
                            }
                            className="w-full text-sm text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all font-medium"
                            placeholder='e.g. 34" (86cm)'
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 4 — Variants
        ════════════════════════════════════════════════════════════════════ */}
        <SectionCard icon={Layers} title="Variants / वेरिएंट">
          <div className="space-y-3">
            {/* Column headers — shown only once above first row */}
            {form.variants.length > 0 && (
              <div className="grid grid-cols-[1fr_1fr_120px_36px] gap-3 items-end">
                <p className="text-xs font-semibold text-slate-500 pl-1">
                  Size / साइज़
                </p>
                <p className="text-xs font-semibold text-slate-500 pl-1">
                  Color / रंग
                </p>
                <p className="text-xs font-semibold text-slate-500 pl-1">
                  Stock Qty / स्टॉक{" "}
                  <span className="text-red-400 font-bold">*</span>
                </p>
                <span />
              </div>
            )}

            {form.variants.map((variant, vIdx) => (
              <div
                key={vIdx}
                className="grid grid-cols-[1fr_1fr_120px_36px] gap-3 items-center"
              >
                <input
                  id={`variant-${vIdx}-size`}
                  type="text"
                  value={variant.size}
                  onChange={(e) => setVariantField(vIdx, "size", e.target.value)}
                  placeholder="S / M / L / XL"
                  className={inputCls(false)}
                />
                <input
                  id={`variant-${vIdx}-color`}
                  type="text"
                  value={variant.color}
                  onChange={(e) =>
                    setVariantField(vIdx, "color", e.target.value)
                  }
                  placeholder="e.g. Navy Blue"
                  className={inputCls(false)}
                />
                <input
                  id={`variant-${vIdx}-stock`}
                  type="number"
                  value={variant.stock_qty}
                  onChange={(e) =>
                    setVariantField(vIdx, "stock_qty", e.target.value)
                  }
                  placeholder="Qty"
                  min={0}
                  // Highlight empty stock_qty — seller must fill per §8
                  className={inputCls(variant.stock_qty === "")}
                />
                <button
                  onClick={() => removeVariant(vIdx)}
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                  aria-label={`Remove variant ${vIdx + 1}`}
                  id={`remove-variant-${vIdx}-btn`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}

            {form.variants.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">
                No variants yet — add one below / अभी कोई वेरिएंट नहीं है
              </p>
            )}

            <button
              onClick={addVariant}
              id="add-variant-btn"
              className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-500 font-medium transition-colors"
            >
              <Plus size={15} />
              Add variant / वेरिएंट जोड़ें
            </button>
          </div>
        </SectionCard>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 5 — Pricing
        ════════════════════════════════════════════════════════════════════ */}
        <SectionCard icon={IndianRupee} title="Pricing / मूल्य निर्धारण">
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 -mt-1">
            ⚠️ Per AGENTS.md §8, pricing fields are always <strong>medium confidence</strong> — 
            the AI cannot verify your stated price from the image. Please confirm all values.
            &nbsp;/&nbsp; कीमत सम्बन्धी सभी जानकारी कृपया पुष्टि करें।
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

            {/* Seller price */}
            <FieldRow
              fieldKey="seller_price"
              flag={cfFlag("pricing_inputs.seller_price")}
              isFilled={isFieldFilled("seller_price", form)}
            >
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-semibold pointer-events-none">
                  ₹
                </span>
                <input
                  id="field-pricing_inputs-seller_price"
                  type="number"
                  value={form.pricing_inputs.seller_price}
                  onChange={(e) => setPricingField("seller_price", e.target.value)}
                  className={`pl-8 ${inputCls(isLow("pricing_inputs.seller_price"))}`}
                  placeholder="0.00"
                  min={0}
                  step={0.01}
                />
              </div>
            </FieldRow>

            {/* MRP */}
            <FieldRow
              fieldKey="mrp"
              flag={cfFlag("pricing_inputs.mrp")}
              isFilled={isFieldFilled("mrp", form)}
            >
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-semibold pointer-events-none">
                  ₹
                </span>
                <input
                  id="field-pricing_inputs-mrp"
                  type="number"
                  value={form.pricing_inputs.mrp}
                  onChange={(e) => setPricingField("mrp", e.target.value)}
                  className={`pl-8 ${inputCls(isLow("pricing_inputs.mrp"))}`}
                  placeholder="0.00"
                  min={0}
                  step={0.01}
                />
              </div>
              {form.pricing_inputs.seller_price && (
                <div className="mt-1.5 space-y-1">
                  {form.pricing_inputs.mrp && parseFloat(form.pricing_inputs.mrp) < parseFloat(form.pricing_inputs.seller_price) ? (
                    <p className="text-xs text-red-500 font-medium" id="mrp-warning">
                      ⚠️ MRP विक्रेता मूल्य से कम नहीं हो सकता / MRP cannot be less than seller price
                    </p>
                  ) : (
                    <p className="text-xs text-indigo-500 font-medium" id="mrp-suggestion-hint">
                      Suggested MRP (40% above your price) — aap badal sakte hain / you can edit this
                    </p>
                  )}
                </div>
              )}
            </FieldRow>

            {/* Weight */}
            <FieldRow
              fieldKey="weight_grams"
              flag={cfFlag("pricing_inputs.weight_grams")}
              isFilled={isFieldFilled("weight_grams", form)}
            >
              <input
                id="field-pricing_inputs-weight_grams"
                type="number"
                value={form.pricing_inputs.weight_grams}
                onChange={(e) => setPricingField("weight_grams", e.target.value)}
                className={inputCls(isLow("pricing_inputs.weight_grams"))}
                placeholder="e.g. 350"
                min={0}
              />
            </FieldRow>

            {/* GST % */}
            <FieldRow
              fieldKey="gst_percent"
              flag={cfFlag("pricing_inputs.gst_percent")}
              isFilled={isFieldFilled("gst_percent", form)}
            >
              <input
                id="field-pricing_inputs-gst_percent"
                type="number"
                value={form.pricing_inputs.gst_percent}
                onChange={(e) => setPricingField("gst_percent", e.target.value)}
                className={inputCls(isLow("pricing_inputs.gst_percent"))}
                placeholder="5 or 18"
                min={0}
                max={100}
                step={1}
              />
              <p className="text-xs text-slate-400 pl-1">
                5% if price ≤ ₹2,500 · 18% if price &gt; ₹2,500 (per AGENTS.md §5b)
              </p>
            </FieldRow>

            {/* HSN Code — full width */}
            <div className="sm:col-span-2">
              <FieldRow
                fieldKey="hsn_code"
                flag={cfFlag("pricing_inputs.hsn_code")}
                isFilled={isFieldFilled("hsn_code", form)}
              >
                <input
                  id="field-pricing_inputs-hsn_code"
                  type="text"
                  value={form.pricing_inputs.hsn_code}
                  onChange={(e) => setPricingField("hsn_code", e.target.value)}
                  className={inputCls(isLow("pricing_inputs.hsn_code"))}
                  placeholder="e.g. 6109"
                />
              </FieldRow>
            </div>
          </div>
        </SectionCard>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 6 — SEO Keywords (read-only, informational)
        ════════════════════════════════════════════════════════════════════ */}
        {originalListing.title_seo_keywords.length > 0 && (
          <SectionCard icon={Search} title="SEO Keywords / एसईओ कीवर्ड">
            <p className="text-xs text-slate-400 -mt-2">
              Generated by AI for title/description optimisation — read-only &amp; informational.
              &nbsp;/&nbsp; AI द्वारा शीर्षक अनुकूलन के लिए तैयार किए गए — केवल देखने के लिए।
            </p>
            <div className="flex flex-wrap gap-2">
              {originalListing.title_seo_keywords.map((kw, i) => (
                <span
                  key={i}
                  className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-3 py-1 text-xs font-medium"
                >
                  {kw}
                </span>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            SUBMIT FOOTER
        ════════════════════════════════════════════════════════════════════ */}
        <div className="pb-10">
          {/* Hint when blocked */}
          {!submitEnabled && (
            <p className="text-center text-xs text-red-500 font-medium mb-3">
              Fill all required fields (marked red ↑) to continue&nbsp;/&nbsp;
              सभी ज़रूरी फ़ील्ड भरें
            </p>
          )}

          <button
            id="submit-listing-btn"
            onClick={handleSubmit}
            disabled={!submitEnabled}
            className="w-full flex items-center justify-center gap-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold py-4 rounded-2xl text-base transition-all duration-150 shadow-xl shadow-indigo-600/25 hover:shadow-indigo-500/30 hover:-translate-y-0.5 disabled:translate-y-0"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 border-2 border-slate-300 border-t-white rounded-full animate-spin inline-block" />
                Saving... / सहेजा जा रहा है...
              </span>
            ) : (
              <>
                <Send size={18} />
                List Product / उत्पाद सूचीबद्ध करें
              </>
            )}
          </button>

          <p className="text-center text-xs text-slate-400 mt-3">
            Your listing will be saved after confirmation&nbsp;·&nbsp;
            पुष्टि के बाद आपकी लिस्टिंग सेव होगी
          </p>
        </div>
      </div>
    </div>
  );
}
