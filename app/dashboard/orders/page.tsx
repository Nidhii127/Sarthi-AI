/**
 * app/dashboard/orders/page.tsx — Static mock orders data
 * Per AGENTS.md §13: no real logic, no DB writes.
 */

import StatCard from "@/components/StatCard";
import DataTable, { StatusBadge } from "@/components/DataTable";
import { ShoppingBag, Clock, Truck, CheckCircle } from "lucide-react";

const ORDERS = [
  { id: "#ORD-7841", product: "Indigo Cotton Kurti (M)", date: "28 Jun 2026", amount: "₹649", status: "Delivered" },
  { id: "#ORD-7839", product: "Women's Striped T-shirt (L)", date: "27 Jun 2026", amount: "₹399", status: "Shipped" },
  { id: "#ORD-7832", product: "Black Slim Pant (32)", date: "27 Jun 2026", amount: "₹899", status: "Pending" },
  { id: "#ORD-7821", product: "Floral Maxi Dress (XL)", date: "26 Jun 2026", amount: "₹1,299", status: "Shipped" },
  { id: "#ORD-7818", product: "Men's Linen Shirt (L)", date: "25 Jun 2026", amount: "₹799", status: "Delivered" },
  { id: "#ORD-7802", product: "Leggings Set — Navy (S)", date: "24 Jun 2026", amount: "₹349", status: "Pending" },
  { id: "#ORD-7798", product: "Printed Saree — Silk Blend", date: "23 Jun 2026", amount: "₹1,549", status: "Delivered" },
  { id: "#ORD-7791", product: "Casual Shorts — Olive (M)", date: "22 Jun 2026", amount: "₹449", status: "Cancelled" },
];

type Order = typeof ORDERS[number];

const STATUS_MAP: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = {
  Delivered: "success",
  Shipped: "info",
  Pending: "warning",
  Cancelled: "danger",
};

export default function OrdersPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Orders</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Track all your customer orders in one place
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Orders" value="142" icon={ShoppingBag} iconColor="text-indigo-600"
          trend={{ value: "12%", up: true }} />
        <StatCard title="Pending" value="8" subtitle="Needs attention" icon={Clock} iconColor="text-amber-600" />
        <StatCard title="Shipped" value="98" icon={Truck} iconColor="text-blue-600" />
        <StatCard title="Delivered" value="36" subtitle="This month" icon={CheckCircle} iconColor="text-emerald-600"
          trend={{ value: "8%", up: true }} />
      </div>

      {/* Table */}
      <DataTable<Order>
        columns={[
          { key: "id", header: "Order ID", className: "font-mono font-medium text-slate-800" },
          { key: "product", header: "Product" },
          { key: "date", header: "Order Date" },
          { key: "amount", header: "Amount", className: "font-semibold text-slate-800" },
          {
            key: "status",
            header: "Status",
            render: (val) => (
              <StatusBadge label={String(val)} variant={STATUS_MAP[String(val)] ?? "neutral"} />
            ),
          },
        ]}
        rows={ORDERS}
      />
    </div>
  );
}
