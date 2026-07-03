/**
 * app/dashboard/claims/page.tsx — Static mock claims data
 * Per AGENTS.md §13: no real logic, no DB writes.
 */

import StatCard from "@/components/StatCard";
import DataTable, { StatusBadge } from "@/components/DataTable";
import { Shield, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

const CLAIMS = [
  {
    id: "#CLM-051",
    type: "Wrong Item",
    product: "Men's Linen Shirt (L)",
    orderId: "#ORD-7698",
    description: "Customer received blue shirt instead of white",
    status: "Open",
    raisedOn: "27 Jun 2026",
  },
  {
    id: "#CLM-050",
    type: "Damaged Goods",
    product: "Floral Maxi Dress (M)",
    orderId: "#ORD-7641",
    description: "Packaging torn, product has a stain",
    status: "Under Review",
    raisedOn: "25 Jun 2026",
  },
  {
    id: "#CLM-049",
    type: "Not Delivered",
    product: "Printed Saree",
    orderId: "#ORD-7622",
    description: "Tracking shows delivered but customer didn't receive",
    status: "Resolved",
    raisedOn: "22 Jun 2026",
  },
  {
    id: "#CLM-048",
    type: "Counterfeit Claim",
    product: "Premium Silk Kurti (S)",
    orderId: "#ORD-7591",
    description: "Customer alleges product doesn't match description",
    status: "Resolved",
    raisedOn: "19 Jun 2026",
  },
  {
    id: "#CLM-047",
    type: "Wrong Item",
    product: "Cotton Leggings (XL)",
    orderId: "#ORD-7560",
    description: "Size XL delivered instead of L",
    status: "Resolved",
    raisedOn: "15 Jun 2026",
  },
];

type Claim = typeof CLAIMS[number];

const STATUS_MAP: Record<string, "danger" | "warning" | "success" | "neutral"> = {
  Open: "danger",
  "Under Review": "warning",
  Resolved: "success",
};

export default function ClaimsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Claims</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Track and manage customer dispute claims
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Claims" value="5" icon={Shield} iconColor="text-indigo-600" />
        <StatCard title="Open" value="1" subtitle="Needs action" icon={AlertTriangle} iconColor="text-red-500" />
        <StatCard title="Under Review" value="1" icon={Clock} iconColor="text-amber-600" />
        <StatCard title="Resolved" value="3" icon={CheckCircle2} iconColor="text-emerald-600" />
      </div>

      <DataTable<Claim>
        columns={[
          { key: "id", header: "Claim ID", className: "font-mono font-medium" },
          { key: "type", header: "Type" },
          { key: "product", header: "Product" },
          { key: "orderId", header: "Order ID", className: "font-mono text-slate-500" },
          { key: "description", header: "Description", className: "max-w-xs" },
          { key: "raisedOn", header: "Raised On" },
          {
            key: "status",
            header: "Status",
            render: (val) => (
              <StatusBadge label={String(val)} variant={STATUS_MAP[String(val)] ?? "neutral"} />
            ),
          },
        ]}
        rows={CLAIMS}
      />
    </div>
  );
}
