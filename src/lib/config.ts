// ============================================================================
// IMA ACCELERATOR — V1 Platform Configuration
// Version: 1.0.0
// Stack: Next.js 16 + Supabase + Tailwind CSS + Google OAuth
// V1 ONLY — no leaderboard, tiers, player cards, streaks, focus mode,
// analytics config, notification types, feature flags, rate limits, or DB schema
// ============================================================================

// ---------------------------------------------------------------------------
// 1. APP META
// ---------------------------------------------------------------------------
export const APP_CONFIG = {
  name: "IMA Accelerator",
  slug: "ima-accelerator",
  version: "1.0.0",
  description: "Student Performance & Coaching Management Platform",
  url: "https://members.imaccelerator.com",
  supportEmail: "support@imaccelerator.com",
  timezone: "UTC",
  locale: "en",
} as const;

// ---------------------------------------------------------------------------
// 2. ROLES
// ---------------------------------------------------------------------------
export const ROLES = {
  OWNER: "owner",
  COACH: "coach",
  STUDENT: "student",
  STUDENT_DIY: "student_diy",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 3,
  coach: 2,
  student: 1,
  student_diy: 1,
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  coach: "Coach",
  student: "Student",
  student_diy: "Student DIY",
};

// ---------------------------------------------------------------------------
// 3. ROUTES (V1 only — no leaderboard, card, calls, settings)
// ---------------------------------------------------------------------------
export const ROUTES = {
  auth: {
    login: "/login",
    register: "/register",
    noAccess: "/no-access",
    callback: "/api/auth/callback",
  },
  owner: {
    dashboard: "/owner",
    coaches: "/owner/coaches",
    coachDetail: "/owner/coaches/[coachId]",
    students: "/owner/students",
    studentDetail: "/owner/students/[studentId]",
    analytics: "/owner/analytics",
    invites: "/owner/invites",
    assignments: "/owner/assignments",
    alerts: "/owner/alerts",
    resources: "/owner/resources",
  },
  coach: {
    dashboard: "/coach",
    students: "/coach/students",
    studentDetail: "/coach/students/[studentId]",
    invites: "/coach/invites",
    reports: "/coach/reports",
    analytics: "/coach/analytics",
    alerts: "/coach/alerts",
    assignments: "/coach/assignments",
    resources: "/coach/resources",
  },
  student: {
    dashboard: "/student",
    workTracker: "/student/work",
    calendar: "/student/calendar",
    roadmap: "/student/roadmap",
    askAI: "/student/ask",
    report: "/student/report",
    deals: "/student/deals",
    resources: "/student/resources",
    analytics: "/student/analytics",
    referral: "/student/referral",
  },
  student_diy: {
    dashboard: "/student_diy",
    workTracker: "/student_diy/work",
    calendar: "/student_diy/calendar",
    roadmap: "/student_diy/roadmap",
    deals: "/student_diy/deals",
    resources: "/student_diy/resources",
    analytics: "/student_diy/analytics",
    referral: "/student_diy/referral",
  },
  api: {
    auth: "/api/auth",
    callback: "/api/auth/callback",
  },
} as const;

export const ROLE_REDIRECTS: Record<Role, string> = {
  owner: ROUTES.owner.dashboard,
  coach: ROUTES.coach.dashboard,
  student: ROUTES.student.dashboard,
  student_diy: ROUTES.student_diy.dashboard,
};

// ---------------------------------------------------------------------------
// 4. AUTH CONFIG
// ---------------------------------------------------------------------------
export const AUTH_CONFIG = {
  provider: "google" as const,
  inviteOnly: true,
  matchInviteByEmail: true,
  noAccessRedirect: "/no-access",
} as const;

// ---------------------------------------------------------------------------
// 5. WORK TRACKER CONFIG
// ---------------------------------------------------------------------------
export const WORK_TRACKER = {
  sessionMinutes: 45,
  breakMinutes: 15,
  cyclesPerDay: 4,
  // Visible daily *goal* (the progress ring target). Distinct from the cap below.
  dailyGoalHours: 4,
  // Hard daily *cap* on planned + logged work before the plan is fulfilled and
  // the cap lifts for extra ad-hoc sessions. Raised from the old 4h goal so
  // students who work in longer blocks aren't blocked.
  dailyCapHours: 8,
  abandonGraceSeconds: 300,
  // Quick-pick presets shown as buttons. A custom duration (any value between
  // minSessionMinutes and maxSessionMinutes) is also allowed.
  sessionDurationOptions: [30, 45, 60, 90, 120] as const,
  defaultSessionMinutes: 45,
  // Bounds for a custom session duration, in minutes.
  minSessionMinutes: 5,
  maxSessionMinutes: 240,
  breakOptions: {
    short: { label: "Short Break", presets: [5, 10] as const },
    long: { label: "Long Break", presets: [15, 20, 25, 30] as const },
  } as const,
} as const;

// ---------------------------------------------------------------------------
// 5.5 KPI TARGETS
// ---------------------------------------------------------------------------
export const KPI_TARGETS = {
  lifetimeOutreach: 2500,
  dailyOutreach: 50,
  // 75 program days × WORK_TRACKER.dailyGoalHours
  lifetimeHours: 300,
} as const;

// ---------------------------------------------------------------------------
// 6. ROADMAP MILESTONES (16 steps, 3 stages)
// target_days = cumulative days from student's joined_at date
// Stage 2-3 steps have target_days: null (no deadlines)
// unlock_url = optional link shown when step becomes active
// ---------------------------------------------------------------------------
export const ROADMAP_STEPS = [
  // Stage 1: Setup & Preparation (Steps 1-8, day-based deadlines)
  { step: 1, stage: 1, stageName: "Setup & Preparation", title: "Join the Course", description: "Complete your onboarding and set up your profile (time asap)", autoComplete: true, target_days: 0 as number | null, unlock_url: null as string | null },
  { step: 2, stage: 1, stageName: "Setup & Preparation", title: "Finish Welcome Chapter", description: "Watch the welcome videos and complete the introductory chapter (2 hrs)", target_days: 0 as number | null, unlock_url: null as string | null },
  { step: 3, stage: 1, stageName: "Setup & Preparation", title: "Select Niche Chapter", description: "Choose the influencer niche you will focus on and complete the niche chapter (1hr - don't overthink it)", target_days: 0 as number | null, unlock_url: null as string | null },
  { step: 4, stage: 1, stageName: "Setup & Preparation", title: "Set Up Your Agency", description: "Set up your agency infrastructure — email, domain, and professional presence (begin on day 1 - finish by day 2)", target_days: 1 as number | null, unlock_url: null as string | null },
  { step: 5, stage: 1, stageName: "Setup & Preparation", title: "Begin 14 Day Warmup", description: "Start your 14-day email warmup to build sender reputation (Day 3)", target_days: 3 as number | null, unlock_url: "https://www.skool.com/the-ima-accelerator-9388/ultimate-influencer-brand-crm-organize-your-contacts" as string | null },
  { step: 6, stage: 1, stageName: "Setup & Preparation", title: "Build 100 Influencer Lead List", description: "Build 100 Influencer Lead List, and Watch 3 Influencer Roast My Email (Day 6)", target_days: 4 as number | null, unlock_url: null as string | null },
  { step: 7, stage: 1, stageName: "Setup & Preparation", title: "Draft Your First Outreach Emails", description: "Draft your first outreach emails using the templates and frameworks from the course (volume is key here)", target_days: 4 as number | null, unlock_url: null as string | null },
  { step: 8, stage: 1, stageName: "Setup & Preparation", title: "Join at least one Influencer Q&A session", description: "Attend a live Influencer Q&A call with the IMA team.", target_days: 5 as number | null, unlock_url: null as string | null },
  // Stage 2: Influencer Outreach (Steps 9-12, day-based deadlines)
  { step: 9, stage: 2, stageName: "Influencer Outreach", title: "Send Your First Email", description: "Send your first outreach email to an influencer (Day 14)", target_days: 14 as number | null, unlock_url: "https://www.loom.com/share/placeholder-osama" as string | null },
  { step: 10, stage: 2, stageName: "Influencer Outreach", title: "Get First Reply", description: "Receive a reply from an influencer — positive or negative, it counts (Day 17)", target_days: 17 as number | null, unlock_url: null as string | null },
  { step: 11, stage: 2, stageName: "Influencer Outreach", title: "Close First Influencer", description: "Sign your first influencer to your roster — you are officially an agent (Day 25)", target_days: 25 as number | null, unlock_url: null as string | null },
  { step: 12, stage: 2, stageName: "Influencer Outreach", title: "Close 5 Influencers", description: "Build your roster to 5 signed influencers ready for brand deals (Day 40)", target_days: 40 as number | null, unlock_url: null as string | null },
  // Stage 3: Brand Outreach (Steps 13-16, day-based deadlines)
  { step: 13, stage: 3, stageName: "Brand Outreach", title: "Enter Brand Outreach", description: "Transition from influencer outreach to pitching brands (Day 41)", target_days: 41 as number | null, unlock_url: "https://www.loom.com/share/placeholder-motivator" as string | null },
  { step: 14, stage: 3, stageName: "Brand Outreach", title: "Get Brand Response", description: "Receive your first response from a brand you pitched (Day 50)", target_days: 50 as number | null, unlock_url: "https://www.loom.com/share/placeholder-motivator" as string | null },
  { step: 15, stage: 3, stageName: "Brand Outreach", title: "Receive Your First Brand Rejection", description: "Get your first brand rejection — a milestone that means you are in the game", target_days: null as number | null, unlock_url: "https://www.loom.com/share/placeholder-motivator" as string | null },
  { step: 16, stage: 3, stageName: "Brand Outreach", title: "Close First Deal", description: "Negotiate and close your first paid brand deal — this is where it all pays off", target_days: null as number | null, unlock_url: "https://www.loom.com/share/placeholder-congratulation" as string | null },
] as const;

// ---------------------------------------------------------------------------
// 7. DAILY REPORT CONFIG
// ---------------------------------------------------------------------------
export const DAILY_REPORT = {
  autoFillHours: true,
  ratingMin: 1,
  ratingMax: 5,
  fields: {
    starRating: { label: "Rate your day", required: true },
    brandsContacted: { label: "Brands outreach", required: true },
    influencersContacted: { label: "Influencers outreach", required: true },
    callsJoined: { label: "Calls joined", required: true },
    wins: { label: "What went well today?", required: false, maxLength: 500 },
    improvements: { label: "What could you improve tomorrow?", required: false, maxLength: 500 },
  },
  deadlineHour: 23,
} as const;

// ---------------------------------------------------------------------------
// 8. COACH DASHBOARD CONFIG
// ---------------------------------------------------------------------------
export const COACH_CONFIG = {
  atRiskInactiveDays: 3,
  atRiskRatingThreshold: 2,
  maxStudentsPerCoach: 100,
  reportInboxDays: 7,
  milestoneMinutesThreshold: 6000,  // 100 hours in minutes
  milestoneDaysWindow: 45,          // days since joined_at
} as const;

// ---------------------------------------------------------------------------
// 9. OWNER DASHBOARD CONFIG
// ---------------------------------------------------------------------------
export const OWNER_CONFIG = {
  alertThresholds: {
    studentInactiveDays: 3,
    studentDropoffDays: 7,
    coachUnderperformingRating: 2.5,
    coachUnderperformingWindowDays: 14,
  },
} as const;

// ---------------------------------------------------------------------------
// 10. INVITE CONFIG
// ---------------------------------------------------------------------------
export const INVITE_CONFIG = {
  codeExpiryHours: 72,
  inviteRules: {
    owner: ["coach", "student", "student_diy"] as Role[],
    coach: ["student", "student_diy"] as Role[],
    student: [] as Role[],
    student_diy: [] as Role[],
  },
} as const;

// ---------------------------------------------------------------------------
// 11. AI ASSISTANT CONFIG
// ---------------------------------------------------------------------------
export const AI_CONFIG = {
  method: "iframe" as const,
  iframeUrl: "", // TODO: Get URL from Abu Lahya before ship
  title: "Ask Abu Lahya",
  subtitle: "Your 24/7 AI mentor",
} as const;

// Business check-in — students refresh a snapshot of their business every
// `refreshDays` to keep the AI unlocked, so its advice fits where they are.
export const BUSINESS_CHECKIN = {
  refreshDays: 30,
  // Show the "refresh soon" nudge this many days before it lapses.
  dueSoonDays: 5,
  moneyMax: 999_999_999_999,
  textMax: 500,
  employeesMax: 10_000,
  rosterMax: 100_000,
  feelings: [
    { value: 1, label: "Struggling" },
    { value: 2, label: "Low" },
    { value: 3, label: "Okay" },
    { value: 4, label: "Good" },
    { value: 5, label: "Fired up" },
  ],
} as const;

// ---------------------------------------------------------------------------
// 12. THEME — REMOVED
// ---------------------------------------------------------------------------
// A `THEME` const used to duplicate a subset of the palette here. It had 0
// importers and was a standing drift hazard: two partial copies of the same
// colors that had to be hand-synced (and had already diverged on `background`).
//
// The palette lives in ONE place — `tailwind.config.ts` under
// `theme.extend.colors.ima`, consumed as `text-ima-*` / `bg-ima-*` /
// `border-ima-*`. The font stack lives in `src/app/layout.tsx` (`next/font`).
// See docs/design/05-style-guide.md. Do not reintroduce a JS color map.

// ---------------------------------------------------------------------------
// 13. NAVIGATION — V1 with separators and badge support
// Locked decision from CONTEXT.md:
//   - Owner: Dashboard, Coaches, Students | Invites, Assignments, Alerts | Resources
//   - Coach: Dashboard, My Students, Reports | Invite Students, Analytics, Alerts, Chat | Resources
//     (Reports has badge for unreviewed count)
//   - Student: Dashboard, Work Tracker, Daily Report, Roadmap, Ask Abu Lahya, Announcements, Deals, Analytics, Resources, Referral
//     (Daily Report sits directly under Work Tracker so logging the day stays one click from the timer)
//   - Student_DIY: Dashboard, Work Tracker, Roadmap (NO Resources per D-11)
// ---------------------------------------------------------------------------
export type NavItem = {
  label: string;
  href: string;
  icon: string;
  separator?: boolean; // render divider BEFORE this item
  badge?: string;      // key for dynamic badge count
};

// TEMPORARY (2026-06-09): Deals, Analytics, Resources, and Announcements tabs
// are hidden across every role to keep the platform straightforward. Referral
// is no longer a tab either — it now lives as a floating "Get my referral link"
// pill (see src/components/student/ReferralPill.tsx). The routes/pages still
// exist; only the nav links are removed. Restore by un-commenting the lines
// below.
export const NAVIGATION: Record<Role, NavItem[]> = {
  owner: [
    { label: "Dashboard",   href: "/owner",             icon: "LayoutDashboard" },
    { label: "Coaches",     href: "/owner/coaches",     icon: "Shield" },
    { label: "Students",    href: "/owner/students",    icon: "Users" },
    { label: "Analytics",   href: ROUTES.owner.analytics, icon: "BarChart3" },
    { label: "Invites",     href: "/owner/invites",     icon: "UserPlus",      separator: true },
    { label: "Assignments", href: "/owner/assignments", icon: "ArrowLeftRight" },
    { label: "Alerts",      href: "/owner/alerts",      icon: "Bell",          badge: "active_alerts" },
    // { label: "Announcements", href: "/owner/announcements", icon: "Megaphone" },
    // { label: "Resources",   href: ROUTES.owner.resources, icon: "BookOpen",    separator: true },
  ],
  coach: [
    { label: "Dashboard",       href: "/coach",              icon: "LayoutDashboard" },
    { label: "My Students",     href: "/coach/students",     icon: "Users" },
    { label: "Reports",         href: "/coach/reports",      icon: "FileText",      badge: "unreviewed_reports" },
    { label: "Invite Students", href: "/coach/invites",      icon: "UserPlus",      separator: true },
    { label: "Assignments",     href: "/coach/assignments",  icon: "ArrowLeftRight" },
    // { label: "Analytics",       href: "/coach/analytics",    icon: "BarChart3" },
    { label: "Alerts",          href: "/coach/alerts",       icon: "Bell",          badge: "coach_milestone_alerts" },
    // { label: "Announcements",   href: "/coach/announcements", icon: "Megaphone" },
    // { label: "Resources",       href: ROUTES.coach.resources, icon: "BookOpen",      separator: true },
  ],
  student: [
    // Short, plain labels — they double as the phone bottom-bar labels.
    { label: "Home",          href: "/student",         icon: "LayoutDashboard" },
    { label: "Work",          href: "/student/work",    icon: "Timer" },
    { label: "Report",        href: "/student/report",  icon: "FileText" },
    { label: "My Steps",      href: "/student/roadmap", icon: "Map" },
    { label: "Ask AI",        href: "/student/ask",     icon: "MessageSquare" },
    // { label: "Announcements", href: "/student/announcements", icon: "Megaphone" },
    // { label: "Deals",         href: ROUTES.student.deals, icon: "DollarSign" },
    // { label: "Analytics",     href: ROUTES.student.analytics, icon: "BarChart3" },
    // { label: "Resources",     href: ROUTES.student.resources, icon: "BookOpen" },
    // Referral moved to floating pill (ReferralPill.tsx)
    // { label: "Referral",      href: ROUTES.student.referral, icon: "Gift" },
  ],
  student_diy: [
    { label: "Home",         href: "/student_diy",         icon: "LayoutDashboard" },
    { label: "Work",         href: "/student_diy/work",    icon: "Timer" },
    { label: "My Steps",     href: "/student_diy/roadmap", icon: "Map" },
    // { label: "Announcements", href: "/student_diy/announcements", icon: "Megaphone" },
    // { label: "Deals",        href: ROUTES.student_diy.deals, icon: "DollarSign" },
    // { label: "Analytics",    href: ROUTES.student_diy.analytics, icon: "BarChart3" },
    // { label: "Resources",    href: ROUTES.student_diy.resources, icon: "BookOpen" },
    // Referral moved to floating pill (ReferralPill.tsx)
    // { label: "Referral",     href: ROUTES.student_diy.referral, icon: "Gift" },
  ],
};

// ---------------------------------------------------------------------------
// 14. VALIDATION
// ---------------------------------------------------------------------------
export const VALIDATION = {
  name: { min: 2, max: 100 },
  email: { max: 255 },
  niche: { max: 100 },
  reportWins: { max: 500 },
  reportImprovements: { max: 500 },
  outreachCount: { min: 0, max: 500 },
  brandsContacted: { min: 0, max: 500 },
  influencersContacted: { min: 0, max: 500 },
  callsJoined: { min: 0, max: 100 },
  starRating: { min: 1, max: 5 },
  deals: {
    revenueMin: 0,
    revenueMax: 9999999999.99,
    profitMin: 0,
    profitMax: 9999999999.99,
  },
} as const;

// ---------------------------------------------------------------------------
// 15. ACTIVITY — student active/inactive threshold (D-14)
//     SYNC: mirrors public.student_activity_status in
//           supabase/migrations/00021_analytics_foundation.sql
//           Changing inactiveAfterDays REQUIRES updating the SQL helper's
//           `v_cutoff := p_today - (inactiveAfterDays - 1)` expression and
//           creating a new migration to redefine student_activity_status.
// ---------------------------------------------------------------------------
export const ACTIVITY = {
  inactiveAfterDays: 7, // D-14 locked: inactive = no completed work_session AND no submitted report in last 7 days
} as const;

// ---------------------------------------------------------------------------
// 16. MILESTONE CONFIG (v1.5 — coach notifications for 4 new student milestones)
//     SYNC: roadmap-step references and alert-key namespaces are consumed by the
//           Phase 51 milestone RPC (future migration 00027_*). Alert-key
//           namespaces are ALSO consumed by the /coach/alerts page UI and the
//           coach branch of get_sidebar_badges. Changing any numeric step
//           reference, alert-key namespace, or LIKE pattern REQUIRES a new
//           migration that rewrites the RPC to match.
//
//     Feature flag: techSetupEnabled defaults to false — the Tech/Email Setup
//     trigger does NOT fire until D-06 resolves at the Monday stakeholder
//     meeting. Code paths that evaluate this milestone MUST short-circuit on
//     the flag. Flip to `true` in the same commit that confirms D-06 and sets
//     MILESTONE_CONFIG.techSetupStep to the confirmed numeric step.
// ---------------------------------------------------------------------------
export type MilestoneType =
  | "tech_setup"
  | "5_influencers"
  | "brand_response"
  | "closed_deal";

export const MILESTONE_CONFIG = {
  // D-06 resolved (v1.8 F5, Phase 62): Step 4 = "Set Up Your Agency" in
  // ROADMAP_STEPS. SYNC: supabase/migrations/00034_activate_tech_setup.sql
  // rewrites the tech_setup CTE to read rp.step_number = 4. Paired with
  // MILESTONE_FEATURE_FLAGS.techSetupEnabled = true so the Phase 51 RPC
  // emits tech_setup rows at runtime.
  techSetupStep: 4 as number | null,

  // Locked: Roadmap step 12 = "Close 5 Influencers" (stage 2).
  // SYNC: ROADMAP_STEPS[11].step === 12. Shifted 11→12 in Phase 57 after
  // new Step 8 "Join at least one Influencer Q&A session" was inserted at
  // the end of Stage 1. Must match supabase/migrations/00030 RPC.
  influencersClosedStep: 12,

  // Locked: Roadmap step 14 = "Get Brand Response" (stage 3).
  // SYNC: ROADMAP_STEPS[13].step === 14. Shifted 13→14 in Phase 57 after
  // new Step 8 "Join at least one Influencer Q&A session" was inserted at
  // the end of Stage 1. Must match supabase/migrations/00030 RPC.
  brandResponseStep: 14,
} as const;

export const MILESTONE_FEATURE_FLAGS = {
  // Activated v1.8 F5 (Phase 62). When `true`, the Phase 51 RPC's Tech/Email
  // Setup branch evaluates MILESTONE_CONFIG.techSetupStep and fires alerts
  // keyed via MILESTONES.techSetup(studentId). Historical Step-4 completions
  // are pre-dismissed by migration 00034 so flipping this flag does NOT
  // produce a retroactive flood for existing students.
  techSetupEnabled: true,
} as const;

// Alert-key namespace constants + composers.
// SYNC: alert_dismissals.alert_key shape for coach_milestone_alerts.
// Mirrors the existing "100h_milestone:{student_id}" convention from
// supabase/migrations/00014_coach_alert_dismissals.sql (260401-cwd pattern).
//
// Idempotency contract (NOTIF-05):
//   - techSetup / fiveInfluencers / brandResponse : ONE-SHOT per student
//       key shape: "milestone_{type}:{student_id}"
//       → second Step 11 completion for same student = no new notification
//   - closedDeal : PER-DEAL (D-07) — fires on EVERY deal
//       key shape: "milestone_closed_deal:{student_id}:{deal_id}"
//       → second deal by same student = new notification (different deal_id)
export const MILESTONES = {
  techSetup: (studentId: string) =>
    `milestone_tech_setup:${studentId}` as const,

  fiveInfluencers: (studentId: string) =>
    `milestone_5_influencers:${studentId}` as const,

  brandResponse: (studentId: string) =>
    `milestone_brand_response:${studentId}` as const,

  closedDeal: (studentId: string, dealId: string) =>
    `milestone_closed_deal:${studentId}:${dealId}` as const,
} as const;

// LIKE patterns for alert_dismissals queries (Phase 51 RPC + /coach/alerts UI).
// Kept as named constants so the migration SYNC comment can reference them by
// name rather than duplicating the raw string.
export const MILESTONE_KEY_PATTERNS = {
  techSetup: "milestone_tech_setup:%",
  fiveInfluencers: "milestone_5_influencers:%",
  brandResponse: "milestone_brand_response:%",
  closedDeal: "milestone_closed_deal:%",
  // Matches ALL v1.5 milestone keys but NOT legacy 100h_milestone:%.
  allV15Milestones: "milestone_%",
} as const;

// ---------------------------------------------------------------------------
// 17. DEFAULT EXPORT — aggregate all V1 configs
// ---------------------------------------------------------------------------
const config = {
  app: APP_CONFIG,
  auth: AUTH_CONFIG,
  roles: ROLES,
  routes: ROUTES,
  roleRedirects: ROLE_REDIRECTS,
  workTracker: WORK_TRACKER,
  kpiTargets: KPI_TARGETS,
  roadmap: ROADMAP_STEPS,
  dailyReport: DAILY_REPORT,
  coach: COACH_CONFIG,
  owner: OWNER_CONFIG,
  ai: AI_CONFIG,
  businessCheckin: BUSINESS_CHECKIN,
  activity: ACTIVITY,
  milestones: MILESTONE_CONFIG,
  milestoneFlags: MILESTONE_FEATURE_FLAGS,
  milestoneKeys: MILESTONES,
  milestoneKeyPatterns: MILESTONE_KEY_PATTERNS,
  invites: INVITE_CONFIG,
  navigation: NAVIGATION,
  validation: VALIDATION,
} as const;

export default config;
