import Link from "next/link";
import { PackageSearch } from "lucide-react";

/**
 * components/DataTable.tsx — Generic table for dashboard data
 */

export interface TableColumn<T> {
  key: keyof T | string;
  header: string;
  render?: (value: unknown, row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: TableColumn<T>[];
  rows: T[];
  emptyMessage?: string;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  emptyMessage = "No data available",
}: DataTableProps<T>) {
  return (
    <div className="bg-white rounded-xl border border-[#e6e6ea] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e6e6ea] bg-[#fafafb]">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={`px-5 py-3 text-left text-[11px] font-bold text-[#6c7080] uppercase tracking-wider whitespace-nowrap ${col.className ?? ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f4]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-[#8c8f9c] text-sm"
                >
                  <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                    <div className="w-10 h-10 rounded-full bg-[#f4f4f7] flex items-center justify-center text-[#8c8f9c] mb-2.5">
                      <PackageSearch size={18} />
                    </div>
                    <p className="font-semibold text-[#17181c] text-sm mb-1">No product listings yet</p>
                    <p className="text-xs text-[#8c8f9c]">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const href = (row as Record<string, unknown>).href as string | undefined;
                return (
                  <tr
                    key={i}
                    className={`hover:bg-[#fbfbfd] transition-colors ${href ? "cursor-pointer group" : ""}`}
                  >
                    {columns.map((col) => {
                      const content = col.render
                        ? col.render(row[col.key as keyof T], row)
                        : String(row[col.key as keyof T] ?? "—");

                      return (
                        <td
                          key={String(col.key)}
                          className={`px-5 py-3.5 text-[#17181c] whitespace-nowrap ${col.className ?? ""}`}
                        >
                          {href ? (
                            <Link href={href} className="block w-full h-full text-inherit no-underline">
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Convenience badge helper for use in render() functions */
export function StatusBadge({
  label,
  variant,
}: {
  label: string;
  variant: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  const classes = {
    success: "badge badge-success",
    warning: "badge badge-warning",
    danger: "badge badge-danger",
    info: "badge badge-info",
    neutral: "badge badge-neutral",
  };
  return <span className={classes[variant]}>{label}</span>;
}
