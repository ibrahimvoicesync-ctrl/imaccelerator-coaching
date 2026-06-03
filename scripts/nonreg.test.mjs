// Zero-dependency non-regression checks for the work-tracker changes.
// Run: node scripts/nonreg.test.mjs
// Mirrors the pure logic in src/lib/streak.ts, the session_minutes validation,
// and the PATCH state-transition matrix so we can prove old behavior holds and
// new behavior works.

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL: " + name); }
}

// ── Config mirror (must match src/lib/config.ts) ─────────────────────────────
const WORK_TRACKER = {
  dailyGoalHours: 4,
  dailyCapHours: 8,
  sessionDurationOptions: [30, 45, 60, 90, 120],
  minSessionMinutes: 5,
  maxSessionMinutes: 240,
};

// ── 1. Streak algorithm (verbatim from src/lib/streak.ts) ────────────────────
function ymd(d) { return d.toISOString().split("T")[0]; }
function isNextDay(a, b) {
  const next = new Date(a + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  return ymd(next) === b;
}
function computeStreak(activeDatesArr, now) {
  const activeDates = new Set(activeDatesArr);
  const todayStr = ymd(now);
  const activeToday = activeDates.has(todayStr);
  const cursor = new Date(now);
  if (!activeToday) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let current = 0;
  while (activeDates.has(ymd(cursor))) { current++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  const sorted = [...activeDates].sort();
  let longest = 0, run = 0, prev = null;
  for (const ds of sorted) { run = prev && isNextDay(prev, ds) ? run + 1 : 1; if (run > longest) longest = run; prev = ds; }
  const week = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setUTCDate(d.getUTCDate() - i); const ds = ymd(d); week.push({ date: ds, active: activeDates.has(ds), isToday: ds === todayStr }); }
  return { current, longest, activeToday, week };
}

console.log("Streak:");
const today = new Date("2026-06-03T12:00:00Z");
const d = (s) => s; // YYYY-MM-DD literals
check("empty history → 0 streak", computeStreak([], today).current === 0);
check("today only → 1", computeStreak([d("2026-06-03")], today).current === 1);
check("3 consecutive incl today → 3", computeStreak([d("2026-06-01"), d("2026-06-02"), d("2026-06-03")], today).current === 3);
check("grace: yesterday active, today blank → streak preserved (1)", computeStreak([d("2026-06-02")], today).current === 1);
check("grace: 2-day run ending yesterday, today blank → 2", computeStreak([d("2026-06-01"), d("2026-06-02")], today).current === 2);
check("gap breaks streak (only 2 days ago) → 0", computeStreak([d("2026-06-01")], today).current === 0);
check("activeToday flag false when today blank", computeStreak([d("2026-06-02")], today).activeToday === false);
check("activeToday flag true when today logged", computeStreak([d("2026-06-03")], today).activeToday === true);
const longCase = computeStreak([d("2026-05-10"), d("2026-05-11"), d("2026-05-12"), d("2026-05-20"), d("2026-06-02"), d("2026-06-03")], today);
check("longest run computed (3)", longCase.longest === 3);
check("week strip is 7 days", computeStreak([], today).week.length === 7);
check("week strip oldest→newest, last isToday", (() => { const w = computeStreak([], today).week; return w[6].isToday === true && w[0].date === "2026-05-28"; })());

// ── 2. session_minutes validation (mirrors the Zod .min/.max range) ──────────
function validMinutes(v) {
  return Number.isInteger(v) && v >= WORK_TRACKER.minSessionMinutes && v <= WORK_TRACKER.maxSessionMinutes;
}
console.log("Session duration validation:");
check("legacy preset 30 still valid", validMinutes(30));
check("legacy preset 45 still valid", validMinutes(45));
check("legacy preset 60 still valid", validMinutes(60));
check("new preset 90 valid", validMinutes(90));
check("new preset 120 valid", validMinutes(120));
check("custom 50 valid (was rejected before)", validMinutes(50));
check("custom 240 (max) valid", validMinutes(240));
check("below min (4) rejected", !validMinutes(4));
check("above max (300) rejected", !validMinutes(300));
check("non-integer rejected", !validMinutes(45.5));

// ── 3. Custom-duration clamp (mirrors UI clamp in WorkTrackerClient/CycleCard)
function clamp(raw) {
  return Math.max(WORK_TRACKER.minSessionMinutes, Math.min(WORK_TRACKER.maxSessionMinutes, raw));
}
console.log("Custom-duration clamp:");
check("clamp 1 → 5 (min)", clamp(1) === 5);
check("clamp 500 → 240 (max)", clamp(500) === 240);
check("clamp 75 → 75 (passthrough)", clamp(75) === 75);

// ── 4. Daily plan cap (mirrors planJsonSchema.total_work_minutes.max) ────────
const planCap = WORK_TRACKER.dailyCapHours * 60;
console.log("Daily plan cap:");
check("cap raised to 480 (8h)", planCap === 480);
check("old 240 plan still under cap", 240 <= planCap);
check("7h (420) plan now allowed", 420 <= planCap);
check("9h (540) plan rejected", !(540 <= planCap));

// ── 5. PATCH state-transition matrix (mirrors [id]/route.ts) ─────────────────
const validTransitions = {
  in_progress: ["completed", "paused", "abandoned"],
  paused: ["in_progress", "abandoned"],
};
function canTransition(from, to) {
  const allowed = validTransitions[from];
  return Boolean(allowed && allowed.includes(to));
}
console.log("State transitions (regression):");
check("in_progress → completed allowed", canTransition("in_progress", "completed"));
check("in_progress → paused allowed", canTransition("in_progress", "paused"));
check("in_progress → abandoned allowed", canTransition("in_progress", "abandoned"));
check("paused → in_progress (resume) allowed", canTransition("paused", "in_progress"));
check("paused → abandoned allowed", canTransition("paused", "abandoned"));
check("completed → anything NOT a transition (edit goes via edit branch)", !canTransition("completed", "in_progress"));
check("completed → completed not a transition", !canTransition("completed", "completed"));

// ── 6. Edit mode eligibility (mirrors edit branch guard) ─────────────────────
function canEdit(status) { return status === "completed"; }
console.log("Edit eligibility:");
check("edit allowed on completed", canEdit("completed"));
check("edit rejected on in_progress", !canEdit("in_progress"));
check("edit rejected on paused", !canEdit("paused"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
