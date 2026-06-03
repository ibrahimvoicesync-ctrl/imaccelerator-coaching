-- ============================================================================
-- Phase 65: Owner Alerts Prune to deal_closed Only (F4)
-- Migration: 00036_prune_owner_alerts_to_deal_closed.sql
--
-- Rewrites the OWNER branch of public.get_sidebar_badges (the branch that
-- previously lived at migration 00029:115-183) so the sidebar active_alerts
-- count equals the number of UNDISMISSED deal_closed alerts visible on the
-- /owner/alerts page (OAL-07).
--
-- Counting formula (OWNER branch):
--   active_alerts = GREATEST(0,
--                     (deals created in last 30 days)
--                   - (alert_dismissals rows for this owner with alert_key
--                      matching 'deal_closed:<deal-id>' where that deal is
--                      still inside the 30-day window))
--
-- The JOIN to deals on the UUID embedded in alert_key ensures orphan
-- dismissals (for deals outside the window or deleted deals) are ignored —
-- they cannot over-subtract from the visible count.
--
-- OAL-09 RESOLUTION — 30-day trailing window:
-- The F4 feed uses a 30-day trailing filter on deals.created_at (NOT an
-- unbounded historical list). This matches the Phase 64 trailing-window
-- convention (migration 00035 / 00023:71) and keeps the feed responsive.
-- deals.created_at is treated as the "closure" timestamp — in this schema a
-- deal insert == deal closed (no intermediate states).
--
-- SILENT PRUNE — the 4 legacy alert types (student_inactive, student_dropoff,
-- unreviewed_reports, coach_underperforming) stop being counted by this RPC.
-- Existing dismissed/active rows of those types remain in alert_dismissals
-- untouched for forensic history (OAL-04). No tombstone, no data migration.
--
-- COACH BRANCH (unreviewed_reports + coach_milestone_alerts) and STUDENT
-- BRANCH (empty object) are copied VERBATIM from migration 00029 — this
-- migration only rewrites the OWNER branch. OAL-08 (coach feed unaffected)
-- is guaranteed by this preservation.
--
-- DEFENSIVE DROP — uses the pg_get_function_identity_arguments pattern from
-- migration 00035:67-78 to prevent PGRST203 overload collision. Any existing
-- get_sidebar_badges overloads (2-arg, 4-arg, or otherwise) are dropped
-- before the replacement CREATE so exactly one pg_proc row exists
-- post-migration.
--
-- CACHE KEY BUMP — src/app/(dashboard)/layout.tsx bumps the unstable_cache
-- key from ["sidebar-badges"] to ["sidebar-badges-v2"] in the SAME atomic
-- commit so stale V1 shapes are never served. The cache tag ("badges") is
-- unchanged so existing revalidateTag("badges") calls in /api/deals and
-- /api/alerts/dismiss continue to work.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Defensive DROP — remove every existing overload of get_sidebar_badges
-- (pattern copied from 00035:67-78, which copied it from 00028:47-59)
-- --------------------------------------------------------------------------
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_sidebar_badges'
  LOOP
    EXECUTE format('DROP FUNCTION public.get_sidebar_badges(%s) CASCADE', r.args);
  END LOOP;
END $drop$;

-- --------------------------------------------------------------------------
-- Replacement function — OWNER branch rewritten, COACH/STUDENT verbatim
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sidebar_badges(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- SYNC: must match COACH_CONFIG.reportInboxDays in src/lib/config.ts
  v_report_inbox_days integer := 7;

  v_today date := CURRENT_DATE;

  -- COACH locals (unchanged from 00029)
  v_unreviewed_count     integer := 0;
  v_student              RECORD;
  v_milestone_count      integer := 0;
  v_milestone_dismissed  integer := 0;

  -- OWNER locals (Phase 65 rewrite)
  v_deal_count       integer := 0;
  v_dismissed_count  integer := 0;
BEGIN
  -- ------------------------------------------------------------
  -- COACH ROLE — unchanged from 00029:61-100
  -- unreviewed_reports + 100h milestone alerts
  -- ------------------------------------------------------------
  IF p_role = 'coach' THEN
    SELECT count(*)
      INTO v_unreviewed_count
      FROM daily_reports dr
      JOIN users s ON s.id = dr.student_id
     WHERE s.coach_id = p_user_id
       AND s.status   = 'active'
       AND dr.date   >= (v_today - v_report_inbox_days)
       AND dr.reviewed_by IS NULL
       AND dr.submitted_at IS NOT NULL;

    FOR v_student IN
      SELECT u.id
      FROM users u
      WHERE u.role = 'student'
        AND u.status = 'active'
        AND u.coach_id = p_user_id
        AND u.joined_at >= CURRENT_DATE - 45
    LOOP
      IF (
        SELECT COALESCE(SUM(ws.session_minutes), 0)
        FROM work_sessions ws
        WHERE ws.student_id = v_student.id
          AND ws.status = 'completed'
      ) >= 6000 THEN
        v_milestone_count := v_milestone_count + 1;
      END IF;
    END LOOP;

    SELECT count(*)
      INTO v_milestone_dismissed
      FROM alert_dismissals
     WHERE owner_id = p_user_id
       AND alert_key LIKE '100h_milestone:%';

    RETURN jsonb_build_object(
      'unreviewed_reports', v_unreviewed_count,
      'coach_milestone_alerts', GREATEST(0, v_milestone_count - v_milestone_dismissed)
    );
  END IF;

  -- ------------------------------------------------------------
  -- STUDENT ROLE — unchanged from 00029:107-109
  -- Returns empty object; no student badges after chat removal (Phase 55).
  -- ------------------------------------------------------------
  IF p_role = 'student' THEN
    RETURN '{}'::jsonb;
  END IF;

  -- ------------------------------------------------------------
  -- OWNER ROLE — Phase 65 rewrite (F4)
  -- active_alerts = (deals closed in last 30 days)
  --                 - (dismissed deal_closed:* keys matching those deals)
  -- ------------------------------------------------------------
  IF p_role = 'owner' THEN
    -- Count of deals inside the 30-day trailing window.
    SELECT COUNT(*)
      INTO v_deal_count
      FROM deals d
     WHERE d.created_at >= NOW() - INTERVAL '30 days';

    -- Count of dismissals that correspond to a deal still inside the window.
    -- The JOIN prevents dismissals for deals that aged out or were deleted
    -- from over-subtracting from the visible count.
    SELECT COUNT(*)
      INTO v_dismissed_count
      FROM alert_dismissals ad
      JOIN deals d
        ON d.id::text = split_part(ad.alert_key, ':', 2)
     WHERE ad.owner_id = p_user_id
       AND ad.alert_key LIKE 'deal_closed:%'
       AND d.created_at >= NOW() - INTERVAL '30 days';

    RETURN jsonb_build_object(
      'active_alerts', GREATEST(0, v_deal_count - v_dismissed_count)
    );
  END IF;

  -- Any other role (student_diy or unknown): empty object.
  RETURN '{}'::jsonb;
END;
$$;

COMMIT;
