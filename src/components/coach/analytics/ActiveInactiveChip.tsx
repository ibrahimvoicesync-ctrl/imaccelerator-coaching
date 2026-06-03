/**
 * Phase 48: Active/Inactive header chip.
 *
 * Single pill with two halves separated by a 1px divider. Counts use
 * tabular-nums; native title attribute carries the D-14 definition. role=status
 * + aria-label give screen readers a sentence-form summary.
 */

type Props = {
  activeCount: number;
  inactiveCount: number;
};

export function ActiveInactiveChip({ activeCount, inactiveCount }: Props) {
  return (
    <span
      role="status"
      aria-label={`${activeCount} students active, ${inactiveCount} students inactive in the last 7 days`}
      title="Active = work session or report in last 7 days. Inactive = no activity in last 7 days."
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-white border border-ima-border"
    >
      <span className="inline-flex items-center gap-1 text-ima-success">
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full bg-ima-success"
        />
        <span className="tabular-nums">{activeCount}</span> active
      </span>
      <span className="inline-flex items-center gap-1 text-ima-text-secondary pl-2 border-l border-ima-border">
        <span className="tabular-nums">{inactiveCount}</span> inactive
      </span>
    </span>
  );
}
