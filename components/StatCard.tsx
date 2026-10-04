/**
 * components/StatCard.tsx — Cohesive metric display card for dashboard pages
 *
 * Designed with clear number hierarchy, subtle contextual icons, consistent
 * height, and subtle borders/elevation for a modern SaaS look.
 */
import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: {
    value: string;
    up: boolean;
  };
}

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-[#e11b4c]",
  iconBg = "bg-[#fafafb]",
  trend,
}: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#e6e6ea] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-[#dcdce2] transition-colors flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-[#6c7080] uppercase tracking-wider">
            {title}
          </p>
          <div
            className={`flex items-center justify-center w-7 h-7 rounded-md ${iconBg} ${iconColor} shrink-0`}
            aria-hidden="true"
          >
            <Icon size={14} strokeWidth={2.2} />
          </div>
        </div>

        <div className="mt-3">
          <p className="font-display text-2xl lg:text-[28px] font-bold text-[#17181c] tracking-tight leading-none">
            {value}
          </p>
        </div>
      </div>

      <div className="mt-2.5 min-h-[16px] flex items-center">
        {subtitle ? (
          <p className="text-xs text-[#8c8f9c] font-normal leading-none">{subtitle}</p>
        ) : trend ? (
          <div className="flex items-center gap-1 text-xs">
            <span
              className={`font-semibold ${
                trend.up ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {trend.up ? "▲" : "▼"} {trend.value}
            </span>
            <span className="text-[#8c8f9c]">vs last month</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
