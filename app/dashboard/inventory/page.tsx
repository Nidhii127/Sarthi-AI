/**
 * app/dashboard/inventory/page.tsx — Static mock inventory data
 * Per AGENTS.md §13: no real logic, no DB writes.
 */

import StatCard from "@/components/StatCard";
import DataTable, { StatusBadge } from "@/components/DataTable";
import { Package, AlertTriangle, XCircle, BarChart3 } from "lucide-react";

const INVENTORY = [
  { sku: "KUR-IND-M", product: "Indigo Cotton Kurti", category: "Kurti", sizes: "S, M, L, XL", stock: 42, status: "In Stock" },
  { sku: "TSH-STR-L", product: "Women's Striped T-shirt", category: "T-shirt", sizes: "XS, S, M, L, XL", stock: 18, status: "In Stock" },
  { sku: "PNT-BLK-32", product: "Black Slim Pant", category: "Pant", sizes: "28, 30, 32, 34, 36", stock: 7, status: "Low Stock" },
  { sku: "DRS-FLR-XL", product: "Floral Maxi Dress", category: "Maxi Dress", sizes: "S, M, L, XL", stock: 23, status: "In Stock" },
  { sku: "SRT-LIN-L", product: "Men's Linen Shirt", category: "Shirt", sizes: "S, M, L, XL, XXL", stock: 0, status: "Out of Stock" },
  { sku: "SAR-SLK-FS", product: "Premium Silk Saree", category: "Saree", sizes: "Free Size", stock: 9, status: "In Stock" },
  { sku: "KUR-DSG-M", product: "Designer Kurta (Men)", category: "Kurta", sizes: "M, L, XL", stock: 4, status: "Low Stock" },
  { sku: "LEG-NAV-M", product: "Leggings Set — Navy", category: "Leggings", sizes: "XS, S, M, L, XL", stock: 31, status: "In Stock" },
  { sku: "DRS-CTN-S", product: "Cotton A-line Dress", category: "Dress", sizes: "XS, S, M", stock: 0, status: "Out of Stock" },
  { sku: "SHT-OLV-M", product: "Casual Olive Shorts", category: "Shorts", sizes: "S, M, L, XL", stock: 14, status: "In Stock" },
];

type InventoryItem = typeof INVENTORY[number];

const STATUS_MAP: Record<string, "success" | "warning" | "danger"> = {
  "In Stock": "success",
  "Low Stock": "warning",
  "Out of Stock": "danger",
};

export default function InventoryPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Inventory</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Monitor stock levels across all your SKUs
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total SKUs" value="47" icon={Package} iconColor="text-indigo-600" />
        <StatCard title="Low Stock" value="5" subtitle="< 10 units" icon={AlertTriangle} iconColor="text-amber-600" />
        <StatCard title="Out of Stock" value="2" subtitle="Action needed" icon={XCircle} iconColor="text-red-500" />
        <StatCard title="Avg. Stock" value="18.5" subtitle="units per SKU" icon={BarChart3} iconColor="text-emerald-600" />
      </div>

      <DataTable<InventoryItem>
        columns={[
          { key: "sku", header: "SKU", className: "font-mono text-xs font-medium text-slate-600" },
          { key: "product", header: "Product", className: "font-medium text-slate-800" },
          { key: "category", header: "Category" },
          { key: "sizes", header: "Sizes" },
          {
            key: "stock",
            header: "Stock",
            render: (val) => (
              <span className={`font-semibold ${Number(val) === 0 ? "text-red-500" : Number(val) < 10 ? "text-amber-600" : "text-slate-800"}`}>
                {String(val)} units
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (val) => (
              <StatusBadge label={String(val)} variant={STATUS_MAP[String(val)] ?? "neutral"} />
            ),
          },
        ]}
        rows={INVENTORY}
      />
    </div>
  );
}
