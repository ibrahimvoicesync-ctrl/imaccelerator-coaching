-- =============================================================================
-- Restore v1.5 milestone fold-in to get_sidebar_badges (2-arg coach branch).
-- Migration: 00040_drop_stale_get_sidebar_badges_2arg.sql
--
-- BUG: /coach/alerts shows active milestone alerts (e.g. a $9M closed_deal for
-- Michael Coppotelli) but the sidebar "Alerts" nav badge stays at zero. The
-- 2-arg get_sidebar_badges currently on the remote (from 00036, which copied
-- the coach branch "verbatim" from 00029) only counts legacy 100h milestones
-- and never calls public.get_coach_milestones — so closed_deal / 5_influencers
-- / brand_response / tech_setup alerts are invisible to the sidebar.
--
-- HISTORY:
--   00014 — coach_milestone_alerts (legacy 100h only).
--   00027 (Phase 51) — 4-arg overload folds get_coach_milestones.count into
--                      coach_milestone_alerts. Correct logic, but body
--                      referenced the messages table.
--   00029 (Phase 55, chat removal) — CREATE OR REPLACE 2-arg (new overload);
--                      stripped messages references but never re-added the
--                      Phase 51 fold-in. Left the 4-arg overload orphaned.
--   00032 — hotfix dropped the 4-arg (PGRST203 collision + broken messages
--           reference). The v1.5 fold-in logic was lost here.
--   00036 (Phase 65) — rewrote OWNER branch; coach branch copied verbatim
--                      from 00029 (still no fold-in).
--
-- FIX: defensively drop every overload, then recreate the single 2-arg version
-- with (a) OWNER branch verbatim from 00036, (b) STUDENT branch verbatim,
-- (c) COACH branch that folds in get_coach_milestones.count. This restores
-- Phase 51's intent without reintroducing the 4-arg overload or touching
-- layout.tsx's calling signature.
--
-- Tech-setup gating: hard-codes p_tech_setup_enabled = true. The MILESTONE_
-- FEATURE_FLAGS.techSetupEnabled flag flipped true in Phase 62 (00034) and
-- has remained true since. If a future phase re-gates it, this migration
-- must be revised — the 2-arg signature has no room to thread the flag.
-- =============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Defensive DROP — remove every existing overload (pattern from 00036:57-68)
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
-- Replacement: 2-arg get_sidebar_badges. Coach branch folds in
-- get_coach_milestones (Phase 51 logic restored). Owner + student branches
-- verbatim from 00036.
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

  -- COACH locals
  v_unreviewed_count     integer := 0;
  v_student              RECORD;
  v_milestone_count      integer := 0;
  v_milestone_dismissed  integer := 0;
  v_ms_payload           jsonb;
  v_new_milestone_count  integer := 0;

  -- OWNER locals (verbatim from 00036)
  v_deal_count       integer := 0;
  v_dismissed_count  integer := 0;
BEGIN
  -- ------------------------------------------------------------
  -- COACH ROLE — unreviewed_reports + 100h + v1.5 milestone fold-in
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

    -- Legacy 100h milestone: students who joined within 45 days AND have 6000+
    -- completed session minutes. SYNC: COACH_CONFIG.milestoneMinutesThreshold
    -- (6000) and COACH_CONFIG.milestoneDaysWindow (45).
    FOR v_student IN
      SELECT u.id
      FROM users u
      WHERE u.role = 'student'
        AND u.status = 'active'
        AND u.coach_id = p_user_id
        AND u.joined_at >= v_today - 45
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

    -- Phase 51 fold-in (restored): v1.5 milestone count from get_coach_milestones.
    -- Hard-codes p_tech_setup_enabled = true per MILESTONE_FEATURE_FLAGS
    -- (flipped on in Phase 62 via 00034 and still on).
    v_ms_payload := public.get_coach_milestones(p_user_id, v_today, true);
    v_new_milestone_count := COALESCE((v_ms_payload->>'count')::int, 0);

    RETURN jsonb_build_object(
      'unreviewed_reports', v_unreviewed_count,
      'coach_milestone_alerts',
        GREATEST(0, v_milestone_count - v_milestone_dismissed) + v_new_milestone_count
    );
  END IF;

  -- ------------------------------------------------------------
  -- STUDENT ROLE — verbatim from 00036
  -- ------------------------------------------------------------
  IF p_role = 'student' THEN
    RETURN '{}'::jsonb;
  END IF;

  -- ------------------------------------------------------------
  -- OWNER ROLE — verbatim from 00036
  -- ------------------------------------------------------------
  IF p_role = 'owner' THEN
    SELECT COUNT(*)
      INTO v_deal_count
      FROM deals d
     WHERE d.created_at >= NOW() - INTERVAL '30 days';

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

-- Post-assert: exactly ONE overload of get_sidebar_badges remains.
DO $assert$
DECLARE
  v_count int;
  v_args  text;
BEGIN
  SELECT COUNT(*), string_agg(pg_get_function_identity_arguments(p.oid), ' | ')
    INTO v_count, v_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_sidebar_badges';

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'Migration 00040 post-assert failed: expected 1 get_sidebar_badges overload, got % (%)',
      v_count, v_args;
  END IF;
END $assert$;

COMMIT;
