/**
 * app/dashboard/pricing/page.tsx — Static mock pricing data
 * Per AGENTS.md §13: no real logic, no DB writes.
 * GST tiers per AGENTS.md §5b: ≤₹2500 → 5%, >₹2500 → 18%
 */

import StatCard from "@/components/StatCard";
import DataTable, { StatusBadge } from "@/components/DataTable";
import { Tag, TrendingUp, Package, IndianRupee } from "lucide-react";

const PRODUCTS = [
  { name: "Indigo Cotton Kurti", category: "Kurti", mrp: "₹799", sellingPrice: "₹649", gst: "5%", margin: "18.6%", status: "Active" },
  { name: "Women's Striped T-shirt", category: "T-shirt", mrp: "₹499", sellingPrice: "₹399", gst: "5%", margin: "20.0%", status: "Active" },
  { name: "Black Slim Pant", category: "Pant", mrp: "₹1,199", sellingPrice: "₹899", gst: "5%", margin: "25.0%", status: "Active" },
  { name: "Floral Maxi Dress", category: "Maxi Dress", mrp: "₹1,699", sellingPrice: "₹1,299", gst: "5%", margin: "23.5%", status: "Active" },
  { name: "Men's Linen Shirt", category: "Shirt", mrp: "₹999", sellingPrice: "₹799", gst: "5%", margin: "20.0%", status: "Active" },
  { name: "Premium Silk Saree", category: "Saree", mrp: "₹3,499", sellingPrice: "₹2,799", gst: "18%", margin: "20.0%", status: "Active" },
  { name: "Designer Kurta (Men)", category: "Kurta", mrp: "₹1,099", sellingPrice: "₹849", gst: "5%", margin: "22.7%", status: "Paused" },
  { name: "Leggings Set — Navy", category: "Leggings", mrp: "₹449", sellingPrice: "₹349", gst: "5%", margin: "22.3%", status: "Active" },
];

type Product = typeof PRODUCTS[number];

export default function PricingPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Pricing</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Review MRP, selling price, GST, and margins for your products
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Active Products" value="28" icon={Package} iconColor="text-indigo-600" />
        <StatCard title="Avg. Selling Price" value="₹649" icon={IndianRupee} iconColor="text-emerald-600"
          trend={{ value: "₹40", up: true }} />
        <StatCard title="GST 5% Items" value="22" subtitle="≤ ₹2,500/piece" icon={Tag} iconColor="text-blue-600" />
        <StatCard title="GST 18% Items" value="6" subtitle="> ₹2,500/piece" icon={TrendingUp} iconColor="text-amber-600" />
      </div>

      {/* GST note per AGENTS.md §5b */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 text-sm text-blue-700 flex items-start gap-2">
        <span className="mt-0.5">ℹ️</span>
        <span>
          GST rates are auto-calculated per the Sept 2025 rules: <strong>5%</strong> for products ≤ ₹2,500/piece,{" "}
          <strong>18%</strong> for products above ₹2,500/piece. HSN codes and GST values shown are representative — consult a tax advisor for your filings.
        </span>
      </div>

      <DataTable<Product>
        columns={[
          { key: "name", header: "Product", className: "font-medium text-slate-800" },
          { key: "category", header: "Category" },
          { key: "mrp", header: "MRP" },
          { key: "sellingPrice", header: "Selling Price", className: "font-semibold" },
          { key: "gst", header: "GST %" },
          { key: "margin", header: "Margin", className: "text-emerald-600 font-medium" },
          {
            key: "status",
            header: "Status",
            render: (val) => (
              <StatusBadge label={String(val)} variant={val === "Active" ? "success" : "neutral"} />
            ),
          },
        ]}
        rows={PRODUCTS}
      />
    </div>
  );
}
