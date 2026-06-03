import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { COACH_CONFIG } from "@/lib/config";
import { getTodayUTC } from "@/lib/utils";
import { getCoachMilestonesCached } from "@/lib/rpc/coach-milestones";
import {
  milestoneRowToFeedItem,
  type CoachAlertFeedItem,
  type CoachAlertFeedType,
} from "@/components/coach/alerts-types";
import { CoachAlertsClient } from "@/components/coach/CoachAlertsClient";
import { Trophy, Bell, DollarSign } from "lucide-react";

const DISMISSED_WINDOW_MS = 30 * 86400000;

export default async function CoachAlertsPage() {
  const user = await requireRole("coach");
  const today = getTodayUTC();
  const admin = createAdminClient();

  const [studentsResult, dismissalsResult, milestonesPayload] = await Promise.all([
    admin
      .from("users")
      .select("id, name, joined_at")
      .eq("role", "student")
      .eq("coach_id", user.id)
      .eq("status", "active"),
    admin
      .from("alert_dismissals")
      .select("alert_key, dismissed_at")
      .eq("owner_id", user.id),
    getCoachMilestonesCached(user.id, today),
  ]);

  if (studentsResult.error) {
    console.error("[coach alerts] students fetch error:", studentsResult.error);
  }
  if (dismissalsResult.error) {
    console.error("[coach alerts] dismissals fetch error:", dismissalsResult.error);
  }

  const students = studentsResult.data ?? [];
  const studentsById = new Map(students.map((s) => [s.id, s]));

  const dismissals = dismissalsResult.data ?? [];
  const dismissedKeys = new Set(dismissals.map((d) => d.alert_key));
  const nowTs = new Date().getTime();
  const recentCutoffMs = nowTs - DISMISSED_WINDOW_MS;
  const recentDismissals = dismissals.filter(
    (d) => new Date(d.dismissed_at).getTime() >= recentCutoffMs,
  );

  const nowMs = new Date(today + "T23:59:59Z").getTime();
  const milestoneCutoff = new Date(
    nowMs - COACH_CONFIG.milestoneDaysWindow * 86400000,
  )
    .toISOString()
    .split("T")[0];

  const qualifyingStudents = students.filter(
    (s) => s.joined_at >= milestoneCutoff,
  );

  // ACTIVE feed: RPC items (roadmap milestones) + legacy 100h for qualifying students
  const legacyItems: CoachAlertFeedItem[] = [];
  if (qualifyingStudents.length > 0) {
    const qualifyingIds = qualifyingStudents.map((s) => s.id);
    const { data: sessionData, error: sessionError } = await admin
      .from("work_sessions")
      .select("student_id, session_minutes, completed_at")
      .in("student_id", qualifyingIds)
      .eq("status", "completed");

    if (sessionError) {
      console.error("[coach alerts] sessions fetch error:", sessionError);
    }

    const minutesByStudent = new Map<string, number>();
    const latestCompletionByStudent = new Map<string, string>();
    for (const row of sessionData ?? []) {
      const prev = minutesByStudent.get(row.student_id) ?? 0;
      minutesByStudent.set(row.student_id, prev + (row.session_minutes ?? 0));
      const prevAt = latestCompletionByStudent.get(row.student_id);
      if (!prevAt || (row.completed_at && row.completed_at > prevAt)) {
        latestCompletionByStudent.set(row.student_id, row.completed_at ?? prevAt ?? "");
      }
    }

    for (const student of qualifyingStudents) {
      const totalMinutes = minutesByStudent.get(student.id) ?? 0;
      if (totalMinutes < COACH_CONFIG.milestoneMinutesThreshold) continue;
      const key = `100h_milestone:${student.id}`;
      if (dismissedKeys.has(key)) continue;
      const daysSinceJoin = Math.floor(
        (nowMs - new Date(student.joined_at).getTime()) / 86400000,
      );
      legacyItems.push({
        alert_key: key,
        student_id: student.id,
        student_name: student.name,
        milestone_type: "100h_milestone",
        occurred_at:
          latestCompletionByStudent.get(student.id) ??
          new Date(student.joined_at).toISOString(),
        message: `${student.name} has reached 100+ hours in ${daysSinceJoin} days! Check them out and ask for a testimonial.`,
        deal_id: null,
      });
    }
  }

  const rpcItems: CoachAlertFeedItem[] = milestonesPayload.milestones.map(
    milestoneRowToFeedItem,
  );

  // DISMISSED feed (last 30 days): reconstruct feed items by parsing alert_key.
  // Students no longer under this coach get filtered out — the dismissal stays
  // in DB but is not surfaced here.
  const dismissedAtMap: Record<string, string> = {};
  const dismissedItems: CoachAlertFeedItem[] = [];

  for (const d of recentDismissals) {
    dismissedAtMap[d.alert_key] = d.dismissed_at;

    let studentId: string | null = null;
    let milestoneType: CoachAlertFeedType | null = null;
    let dealId: string | null = null;

    if (d.alert_key.startsWith("100h_milestone:")) {
      studentId = d.alert_key.slice("100h_milestone:".length);
      milestoneType = "100h_milestone";
    } else if (d.alert_key.startsWith("milestone_5_influencers:")) {
      studentId = d.alert_key.slice("milestone_5_influencers:".length);
      milestoneType = "5_influencers";
    } else if (d.alert_key.startsWith("milestone_brand_response:")) {
      studentId = d.alert_key.slice("milestone_brand_response:".length);
      milestoneType = "brand_response";
    } else if (d.alert_key.startsWith("milestone_tech_setup:")) {
      studentId = d.alert_key.slice("milestone_tech_setup:".length);
      milestoneType = "tech_setup";
    } else if (d.alert_key.startsWith("milestone_closed_deal:")) {
      const rest = d.alert_key.slice("milestone_closed_deal:".length);
      const sep = rest.indexOf(":");
      if (sep > 0) {
        studentId = rest.slice(0, sep);
        dealId = rest.slice(sep + 1);
        milestoneType = "closed_deal";
      }
    }

    if (!studentId || !milestoneType) continue;
    const student = studentsById.get(studentId);
    if (!student) continue;

    dismissedItems.push({
      alert_key: d.alert_key,
      student_id: studentId,
      student_name: student.name,
      milestone_type: milestoneType,
      occurred_at: d.dismissed_at,
      message: null,
      deal_id: dealId,
    });
  }

  // Merge everything. Client uses dismissedAtMap to determine dismissed status.
  const activeItems: CoachAlertFeedItem[] = [...legacyItems, ...rpcItems];
  const feed: CoachAlertFeedItem[] = [...activeItems, ...dismissedItems];

  // Fetch deal revenues so closed_deal alerts show "Closed a $X deal" like
  // /owner/alerts — lets coaches see deal size at a glance without opening
  // the student profile.
  const dealIds = Array.from(
    new Set(
      feed
        .filter((i) => i.milestone_type === "closed_deal" && i.deal_id)
        .map((i) => i.deal_id as string),
    ),
  );
  if (dealIds.length > 0) {
    const { data: dealsData, error: dealsError } = await admin
      .from("deals")
      .select("id, revenue")
      .in("id", dealIds);
    if (dealsError) {
      console.error("[coach alerts] deals fetch error:", dealsError);
    }
    const revenueById = new Map<string, number>();
    for (const d of dealsData ?? []) {
      revenueById.set(d.id, Number(d.revenue));
    }
    for (const item of feed) {
      if (item.milestone_type !== "closed_deal" || !item.deal_id) continue;
      const revenue = revenueById.get(item.deal_id);
      if (revenue == null || Number.isNaN(revenue)) continue;
      const formatted = revenue.toLocaleString("en-US", { maximumFractionDigits: 0 });
      item.message = `Closed a $${formatted} deal`;
    }
  }

  feed.sort(
    (a, b) =>
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );

  // Stats
  const activeCount = activeItems.length;
  const milestoneAlertsCount = feed.filter(
    (i) => i.milestone_type !== "closed_deal",
  ).length;
  const thirtyDaysAgoMs = nowTs - 30 * 86400000;
  const dealsClosedCount = feed.filter(
    (i) =>
      i.milestone_type === "closed_deal" &&
      new Date(i.occurred_at).getTime() >= thirtyDaysAgoMs,
  ).length;

  const statCards = [
    {
      label: "Milestone Alerts",
      value: String(milestoneAlertsCount),
      icon: Trophy,
      iconBg: "bg-ima-surface-accent",
      iconColor: "text-ima-primary",
    },
    {
      label: "Active",
      value: String(activeCount),
      icon: Bell,
      iconBg: activeCount > 0 ? "bg-ima-surface-accent" : "bg-ima-surface-light",
      iconColor: activeCount > 0 ? "text-ima-primary" : "text-ima-text-secondary",
    },
    {
      label: "Deals closed (30d)",
      value: String(dealsClosedCount),
      icon: DollarSign,
      iconBg: "bg-ima-success/10",
      iconColor: "text-ima-success",
    },
  ];

  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20 space-y-8">
        <header className="motion-safe:animate-fadeIn">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs font-semibold tracking-[0.08em] text-ima-text-secondary uppercase">
              Alerts
            </p>
            {activeCount > 0 && (
              <span
                className="inline-flex items-center gap-[6px] rounded-full bg-ima-surface-accent text-ima-primary px-[10px] py-[2px] text-[10px] font-semibold uppercase tracking-[0.08em] tabular-nums"
                aria-label={`${activeCount} active alerts`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full bg-ima-primary"
                  aria-hidden="true"
                />
                {activeCount} active
              </span>
            )}
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold leading-tight text-ima-text tracking-tight">
            Milestone Alerts
          </h1>
          <p className="mt-2 text-sm text-ima-text-secondary leading-relaxed">
            Your students&apos; milestone achievements — review and dismiss when actioned.
          </p>
        </header>

        <section
          aria-label="Alert totals"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "50ms" }}
        >
          {statCards.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-4 bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px]"
            >
              <div
                className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 ${s.iconBg}`}
              >
                <s.icon className={`h-[18px] w-[18px] ${s.iconColor}`} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold leading-none tabular-nums tracking-tight text-ima-text">
                  {s.value}
                </p>
                <p className="mt-[6px] text-xs text-ima-text-secondary">{s.label}</p>
              </div>
            </div>
          ))}
        </section>

        <CoachAlertsClient
          initialFeed={feed}
          initialDismissedAtMap={dismissedAtMap}
        />
      </div>
    </div>
  );
}
