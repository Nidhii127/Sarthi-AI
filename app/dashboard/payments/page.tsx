/**
 * app/dashboard/payments/page.tsx — Static mock payments data
 * Per AGENTS.md §13: no real logic, no DB writes.
 */

import StatCard from "@/components/StatCard";
import DataTable, { StatusBadge } from "@/components/DataTable";
import { CreditCard, TrendingUp, Clock, IndianRupee } from "lucide-react";

const PAYMENTS = [
  { date: "28 Jun 2026", txnId: "TXN-2026-0628A", amount: "₹3,847", type: "Settlement", status: "Paid" },
  { date: "25 Jun 2026", txnId: "TXN-2026-0625B", amount: "₹1,298", type: "Settlement", status: "Paid" },
  { date: "22 Jun 2026", txnId: "TXN-2026-0622A", amount: "₹5,440", type: "Settlement", status: "Paid" },
  { date: "20 Jun 2026", txnId: "ADJ-2026-0620", amount: "−₹649", type: "Return Deduction", status: "Processed" },
  { date: "18 Jun 2026", txnId: "TXN-2026-0618C", amount: "₹2,197", type: "Settlement", status: "Paid" },
  { date: "15 Jun 2026", txnId: "TXN-2026-0615A", amount: "₹4,199", type: "Settlement", status: "Paid" },
  { date: "12 Jun 2026", txnId: "ADJ-2026-0612", amount: "−₹399", type: "Return Deduction", status: "Processed" },
  { date: "10 Jun 2026", txnId: "TXN-2026-0610B", amount: "₹1,439", type: "Settlement", status: "Pending" },
  { date: "07 Jun 2026", txnId: "TXN-2026-0607A", amount: "₹3,601", type: "Settlement", status: "Paid" },
  { date: "01 Jul 2026", txnId: "TXN-2026-0701A", amount: "₹4,200", type: "Settlement", status: "Pending" },
];

type Payment = typeof PAYMENTS[number];

const STATUS_MAP: Record<string, "success" | "warning" | "neutral"> = {
  Paid: "success",
  Pending: "warning",
  Processed: "neutral",
};

export default function PaymentsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Payments</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          View settlements and payment history
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="This Month"
          value="₹18,420"
          icon={IndianRupee}
          iconColor="text-indigo-600"
          trend={{ value: "16.7%", up: false }}
        />
        <StatCard
          title="Last Month"
          value="₹22,100"
          icon={TrendingUp}
          iconColor="text-emerald-600"
        />
        <StatCard
          title="Pending"
          value="₹5,639"
          subtitle="2 transactions"
          icon={Clock}
          iconColor="text-amber-600"
        />
        <StatCard
          title="Total Deductions"
          value="₹1,048"
          subtitle="Returns this month"
          icon={CreditCard}
          iconColor="text-red-500"
        />
      </div>

      <DataTable<Payment>
        columns={[
          { key: "date", header: "Date" },
          { key: "txnId", header: "Transaction ID", className: "font-mono text-xs font-medium text-slate-600" },
          { key: "type", header: "Type" },
          {
            key: "amount",
            header: "Amount",
            render: (val) => (
              <span className={`font-semibold ${String(val).startsWith("−") ? "text-red-500" : "text-slate-800"}`}>
                {String(val)}
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
        rows={PAYMENTS}
      />
    </div>
  );
}
