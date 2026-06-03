import {
  formatDealLoggedBy,
  type LoggedByUser,
  type ViewerRole,
  type AttributionVariant,
} from "@/lib/deals-attribution";

interface DealAttributionChipProps {
  deal: { logged_by: string | null };
  viewerRole: ViewerRole;
  viewerId: string;
  userMap: Record<string, LoggedByUser>;
}

const VARIANT_CLASSES: Record<AttributionVariant, string> = {
  self: "bg-ima-surface-accent text-ima-primary",
  coach: "bg-ima-surface-light text-ima-text-secondary",
  owner: "bg-ima-surface-light text-ima-text-secondary",
  unknown: "bg-ima-surface-light text-ima-text-secondary",
};

export function DealAttributionChip({
  deal,
  viewerRole,
  viewerId,
  userMap,
}: DealAttributionChipProps) {
  const result = formatDealLoggedBy(deal, viewerRole, viewerId, userMap);
  return (
    <span
      role="status"
      aria-label={result.ariaLabel}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${VARIANT_CLASSES[result.variant]}`}
    >
      {result.label}
    </span>
  );
}
