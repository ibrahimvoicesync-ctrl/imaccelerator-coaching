import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";

export type KPITint = "primary" | "success" | "info" | "warning";

type Props = {
  label: string;
  value: string;
  icon: LucideIcon;
  tint: KPITint;
  href: string;
  ariaLabel: string;
};

const TINTS: Record<KPITint, { bg: string; text: string }> = {
  primary: { bg: "bg-ima-primary/10", text: "text-ima-primary" },
  success: { bg: "bg-ima-success/10", text: "text-ima-success" },
  info: { bg: "bg-ima-info/10", text: "text-ima-info" },
  warning: { bg: "bg-ima-warning/10", text: "text-ima-warning" },
};

export function KPICard({ label, value, icon: Icon, tint, href, ariaLabel }: Props) {
  const t = TINTS[tint];
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="block min-h-[44px] rounded-xl motion-safe:transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
    >
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div
            className={`w-10 h-10 rounded-lg ${t.bg} flex items-center justify-center shrink-0`}
          >
            <Icon className={`h-5 w-5 ${t.text}`} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-semibold tracking-tight text-ima-text tabular-nums">{value}</p>
            <p className="text-xs text-ima-text-secondary">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
