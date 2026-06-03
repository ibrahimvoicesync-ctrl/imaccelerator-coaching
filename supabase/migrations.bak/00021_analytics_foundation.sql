-- ============================================================================
-- Phase 44: Analytics RPC Foundation & Shared Helpers
-- Migration: 00021_analytics_foundation.sql
--
-- Establishes shared SQL building blocks for v1.5 analytics consumers:
--   1. week_start(date)               — ISO Monday of a given date (IMMUTABLE)
--   2. student_activity_status(uuid,date) — 'active' | 'inactive' per D-14
--   3. idx_deals_student_created      — per-student deal history pagination
--   4. idx_work_sessions_completed_student_date (partial, status='completed')
--   5. idx_roadmap_progress_student_status
--
-- RLS: no new policies here (deals RLS is Phase 45). All new DEFINER functions
--      use (SELECT auth.uid()) pattern where applicable (PERF-03). This file
--      MUST NOT contain any bare `auth.uid()` reference.
--
-- Pattern: SECURITY DEFINER + STABLE for aggregates (PERF-04). All functions
--          SET search_path = public for safety.
--
-- SYNC: student_activity_status inactive threshold (7 days) mirrors
--       ACTIVITY.inactiveAfterDays in src/lib/config.ts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. week_start(p_today date) -> date   (IMMUTABLE, SQL, no side effects)
--    Returns the ISO Monday of the week containing p_today.
--    Sunday input => previous Monday (per ISO 8601 / PG convention).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.week_start(p_today date)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT date_trunc('week', p_today)::date;
$$;

COMMENT ON FUNCTION public.week_start(date) IS
  'ISO Monday (week start) of p_today. SYNC: used by skip tracker, leaderboard, trend buckets across v1.5.';

-- ---------------------------------------------------------------------------
-- 2. student_activity_status(p_student_id uuid, p_today date) -> text
--    Returns 'active' if the student has >= 1 completed work_session OR
--    >= 1 submitted daily_report in the window [p_today - 6, p_today]
--    (i.e. last 7 days inclusive). Otherwise 'inactive'. (D-14)
--
--    STABLE: reads tables, no writes. SECURITY DEFINER so it can be called
--    from RLS-limited contexts (e.g. later analytics RPCs).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_activity_status(
  p_student_id uuid,
  p_today      date
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff date := p_today - 6;  -- last 7 days INCLUSIVE of today
BEGIN
  IF EXISTS (
    SELECT 1 FROM work_sessions ws
    WHERE ws.student_id = p_student_id
      AND ws.status = 'completed'
      AND ws.date BETWEEN v_cutoff AND p_today
  ) THEN
    RETURN 'active';
  END IF;

  IF EXISTS (
    SELECT 1 FROM daily_reports dr
    WHERE dr.student_id = p_student_id
      AND dr.submitted_at IS NOT NULL
      AND dr.date BETWEEN v_cutoff AND p_today
  ) THEN
    RETURN 'active';
  END IF;

  RETURN 'inactive';
END;
$$;

COMMENT ON FUNCTION public.student_activity_status(uuid, date) IS
  'D-14: inactive = no completed work_session AND no submitted daily_report in last 7 days (inclusive of p_today). SYNC: threshold mirrors ACTIVITY.inactiveAfterDays in src/lib/config.ts.';

-- ---------------------------------------------------------------------------
-- 3. Hot-path indexes (PERF-01). All IF NOT EXISTS for idempotency.
-- ---------------------------------------------------------------------------

-- Per-student deal history, newest first (analytics pages + coach deals tab).
CREATE INDEX IF NOT EXISTS idx_deals_student_created
  ON public.deals(student_id, created_at DESC);

-- Hours-worked aggregates + activity checks: only completed sessions are ever
-- counted, so a partial index on status='completed' is both smaller and faster.
CREATE INDEX IF NOT EXISTS idx_work_sessions_completed_student_date
  ON public.work_sessions(student_id, date)
  WHERE status = 'completed';

-- Current active step lookups + aggregate step-by-status counts.
CREATE INDEX IF NOT EXISTS idx_roadmap_progress_student_status
  ON public.roadmap_progress(student_id, status);

-- ---------------------------------------------------------------------------
-- 4. Grants (so anon + authenticated + service_role can call the helpers;
--    helper bodies still enforce correctness — these are pure/STABLE funcs).
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.week_start(date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.student_activity_status(uuid, date) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Embedded correctness asserts. These run at migration time; a failure
--    aborts `supabase db push` and prevents a broken helper from shipping.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_mon date := '2026-04-13'::date; -- Monday
  v_wed date := '2026-04-15'::date; -- Wednesday
  v_sun date := '2026-04-12'::date; -- Sunday (should map to prior Monday 2026-04-06)
BEGIN
  ASSERT public.week_start(v_mon) = '2026-04-13'::date,
    format('week_start(Monday) expected 2026-04-13, got %s', public.week_start(v_mon));
  ASSERT public.week_start(v_wed) = '2026-04-13'::date,
    format('week_start(Wednesday) expected 2026-04-13, got %s', public.week_start(v_wed));
  ASSERT public.week_start(v_sun) = '2026-04-06'::date,
    format('week_start(Sunday) expected 2026-04-06, got %s', public.week_start(v_sun));
END $$;

-- student_activity_status shape check: must return exactly 'active' or 'inactive'
-- for any student uuid (empty tables => 'inactive'). Uses a random uuid that
-- will not match any real row, proving the 'inactive' branch.
DO $$
DECLARE
  v_fake uuid := '00000000-0000-0000-0000-000000000000';
  v_out  text;
BEGIN
  v_out := public.student_activity_status(v_fake, CURRENT_DATE);
  ASSERT v_out = 'inactive',
    format('student_activity_status(non-existent student) expected inactive, got %s', v_out);
END $$;
