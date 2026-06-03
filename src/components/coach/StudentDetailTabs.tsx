"use client";

export type TabKey = "calendar" | "roadmap" | "deals";

interface StudentDetailTabsProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

const tabs: { key: TabKey; label: string }[] = [
  { key: "calendar", label: "Calendar" },
  { key: "roadmap", label: "Roadmap" },
  { key: "deals", label: "Deals" },
];

export function StudentDetailTabs({ activeTab, onTabChange }: StudentDetailTabsProps) {
  return (
    <div
      className="flex gap-0 overflow-x-auto border-b border-ima-border"
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            id={`tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`tabpanel-${tab.key}`}
            onClick={() => onTabChange(tab.key)}
            className={[
              "shrink-0 relative min-h-[44px] px-5 py-3 inline-flex items-center text-sm font-semibold motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2",
              active ? "text-ima-text" : "text-ima-text-secondary hover:text-ima-text",
            ].join(" ")}
          >
            {tab.label}
            {active && (
              <span
                aria-hidden="true"
                className="absolute left-0 right-0 -bottom-px h-[3px] bg-ima-primary"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
