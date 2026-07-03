/**
 * app/dashboard/returns/page.tsx — Static mock returns data
 * Per AGENTS.md §13: no real logic, no DB writes.
 */

import StatCard from "@/components/StatCard";
import DataTable, { StatusBadge } from "@/components/DataTable";
import { RefreshCcw, AlertCircle, CheckCircle2, XCircle } from "lucide-react";

const RETURNS = [
  { id: "#RET-204", orderId: "#ORD-7712", product: "Pink Kurti (M)", reason: "Size mismatch", status: "Approved", date: "26 Jun 2026" },
  { id: "#RET-203", orderId: "#ORD-7698", product: "Men's Slim Pant (30)", reason: "Wrong colour delivered", status: "Pending", date: "25 Jun 2026" },
  { id: "#RET-202", orderId: "#ORD-7681", product: "Striped T-shirt (XL)", reason: "Fabric quality issue", status: "Pending", date: "24 Jun 2026" },
  { id: "#RET-201", orderId: "#ORD-7660", product: "Floral Dress (S)", reason: "Customer changed mind", status: "Rejected", date: "23 Jun 2026" },
  { id: "#RET-200", orderId: "#ORD-7641", product: "Leggings — Navy (M)", reason: "Defective stitching", status: "Approved", date: "22 Jun 2026" },
  { id: "#RET-199", orderId: "#ORD-7622", product: "Cotton Saree (Free size)", reason: "Not as described", status: "Approved", date: "21 Jun 2026" },
];

type Return = typeof RETURNS[number];

const STATUS_MAP: Record<string, "success" | "warning" | "danger"> = {
  Approved: "success",
  Pending: "warning",
  Rejected: "danger",
};

export default function ReturnsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Returns</h1>
        <p className="text-slate-500 text-sm mt-0.5">Manage return requests from customers</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Returns" value="12" icon={RefreshCcw} iconColor="text-indigo-600" />
        <StatCard title="Pending Review" value="3" subtitle="Action needed" icon={AlertCircle} iconColor="text-amber-600" />
        <StatCard title="Approved" value="7" icon={CheckCircle2} iconColor="text-emerald-600" />
        <StatCard title="Rejected" value="2" icon={XCircle} iconColor="text-red-500" />
      </div>

      <DataTable<Return>
        columns={[
          { key: "id", header: "Return ID", className: "font-mono font-medium" },
          { key: "orderId", header: "Order ID", className: "font-mono text-slate-500" },
          { key: "product", header: "Product" },
          { key: "reason", header: "Reason", className: "max-w-xs text-wrap" },
          { key: "date", header: "Raised On" },
          {
            key: "status",
            header: "Status",
            render: (val) => (
              <StatusBadge label={String(val)} variant={STATUS_MAP[String(val)] ?? "neutral"} />
            ),
          },
        ]}
        rows={RETURNS}
      />
    </div>
  );
}
