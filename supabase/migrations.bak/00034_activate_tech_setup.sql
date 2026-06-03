-- =============================================================================
-- Phase 62 (v1.8 F5): Activate tech_setup coach alert at roadmap Step 4.
-- Migration: 00034_activate_tech_setup.sql
--
-- Closes CA-04 + CA-05. Supersedes the tech_setup branch of 00027
-- (which was gated by p_tech_setup_enabled=false and hard-coded step_number=0
-- as a placeholder).
--
-- Resolves D-06: Step 4 = "Set Up Your Agency" in ROADMAP_STEPS. This migration
-- MUST ship in the SAME commit as:
--   - src/lib/config.ts: MILESTONE_CONFIG.techSetupStep = 4,
--                        MILESTONE_FEATURE_FLAGS.techSetupEnabled = true
--   - src/components/coach/alerts-types.ts: MILESTONE_META.tech_setup.label =
--                        "Set Up Your Agency"
--   - src/lib/rpc/coach-milestones.ts: unstable_cache key bumped to
--                        "coach-milestones-v2" (60s TTL rollover would
--                        otherwise serve stale "count: 0" entries for up to
--                        60 seconds post-deploy).
--
-- BACKFILL CONTRACT (CA-05):
--   Every active student currently at step 4 = 'completed' in roadmap_progress
--   produces an alert_dismissals row keyed
--   ('{coach_id}', 'milestone_tech_setup:{student_id}'). This mirrors the
--   Phase 52 backfill pattern from 00027:409-420.
--
-- POST-ASSERT (CA-05):
--   For every active coach c: get_coach_milestones(c.id, CURRENT_DATE, true)
--   returns zero tech_setup rows. Prevents retroactive flood on rollout.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Defensive drop every existing overload of get_coach_milestones
--    (PGRST203 prevention per v1.7 lesson from migration 00032).
-- -----------------------------------------------------------------------------
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_coach_milestones'
  LOOP
    EXECUTE format('DROP FUNCTION public.get_coach_milestones(%s) CASCADE', r.args);
  END LOOP;
END $drop$;

-- -----------------------------------------------------------------------------
-- 2. Recreate get_coach_milestones with tech_setup CTE reading step_number = 4.
--    Body is identical to 00027 EXCEPT the tech_setup CTE WHERE clause.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_milestones(
  p_coach_id              uuid,
  p_today                 date    DEFAULT CURRENT_DATE,
  p_tech_setup_enabled    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      uuid := (SELECT auth.uid());
  v_student_ids uuid[];
  v_milestones  jsonb;
BEGIN
  IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM p_coach_id THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(id) INTO v_student_ids
  FROM users
  WHERE role IN ('student', 'student_diy')
    AND status = 'active'
    AND coach_id = p_coach_id;

  IF v_student_ids IS NULL OR array_length(v_student_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('milestones', '[]'::jsonb, 'count', 0);
  END IF;

  WITH
  five_inf AS (
    SELECT
      ('milestone_5_influencers:' || rp.student_id::text) AS alert_key,
      rp.student_id                                        AS student_id,
      u.name                                               AS student_name,
      '5_influencers'::text                                AS milestone_type,
      NULL::uuid                                           AS deal_id,
      rp.completed_at                                      AS occurred_at
    FROM roadmap_progress rp
    JOIN users u ON u.id = rp.student_id
    WHERE rp.student_id = ANY(v_student_ids)
      AND rp.step_number = 12   -- SYNC: MILESTONE_CONFIG.influencersClosedStep
      AND rp.status = 'completed'
      AND rp.completed_at IS NOT NULL
  ),
  brand_resp AS (
    SELECT
      ('milestone_brand_response:' || rp.student_id::text),
      rp.student_id,
      u.name,
      'brand_response'::text,
      NULL::uuid,
      rp.completed_at
    FROM roadmap_progress rp
    JOIN users u ON u.id = rp.student_id
    WHERE rp.student_id = ANY(v_student_ids)
      AND rp.step_number = 14   -- SYNC: MILESTONE_CONFIG.brandResponseStep
      AND rp.status = 'completed'
      AND rp.completed_at IS NOT NULL
  ),
  closed_deals AS (
    SELECT
      ('milestone_closed_deal:' || d.student_id::text || ':' || d.id::text),
      d.student_id,
      u.name,
      'closed_deal'::text,
      d.id            AS deal_id,
      d.created_at    AS occurred_at
    FROM deals d
    JOIN users u ON u.id = d.student_id
    WHERE d.student_id = ANY(v_student_ids)
  ),
  -- Tech-setup branch — Phase 62: step_number = 4 (was placeholder 0 in 00027).
  -- Gated by p_tech_setup_enabled; v1.8 F5 flips MILESTONE_FEATURE_FLAGS.techSetupEnabled
  -- to true in src/lib/config.ts, so the wrapper now passes true at runtime.
  tech_setup AS (
    SELECT
      ('milestone_tech_setup:' || rp.student_id::text),
      rp.student_id,
      u.name,
      'tech_setup'::text,
      NULL::uuid,
      rp.completed_at
    FROM roadmap_progress rp
    JOIN users u ON u.id = rp.student_id
    WHERE p_tech_setup_enabled = true
      AND rp.student_id = ANY(v_student_ids)
      AND rp.step_number = 4   -- SYNC: MILESTONE_CONFIG.techSetupStep (Phase 62)
      AND rp.status = 'completed'
      AND rp.completed_at IS NOT NULL
  ),
  all_events AS (
    SELECT * FROM five_inf
    UNION ALL SELECT * FROM brand_resp
    UNION ALL SELECT * FROM closed_deals
    UNION ALL SELECT * FROM tech_setup
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'student_id',     ae.student_id,
      'student_name',   ae.student_name,
      'milestone_type', ae.milestone_type,
      'alert_key',      ae.alert_key,
      'deal_id',        ae.deal_id,
      'occurred_at',    ae.occurred_at
    )
    ORDER BY ae.occurred_at DESC
  ), '[]'::jsonb)
  INTO v_milestones
  FROM all_events ae
  LEFT JOIN alert_dismissals ad
    ON ad.owner_id = p_coach_id
   AND ad.alert_key = ae.alert_key
  WHERE ad.alert_key IS NULL;

  RETURN jsonb_build_object(
    'milestones', v_milestones,
    'count',      jsonb_array_length(v_milestones)
  );
END;
$$;

COMMENT ON FUNCTION public.get_coach_milestones(uuid, date, boolean) IS
  'Phase 62 (v1.8 F5): tech_setup CTE reads step_number=4 (was placeholder 0 in 00027). Cache key bumped to coach-milestones-v2 in same commit. Supersedes 00027.';

GRANT EXECUTE ON FUNCTION public.get_coach_milestones(uuid, date, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_milestones(uuid, date, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Backfill alert_dismissals for every historical Step-4 completion.
--    Mirrors Phase 52 pattern at 00027:409-420. Idempotent via ON CONFLICT.
-- -----------------------------------------------------------------------------
DO $backfill$
BEGIN
  INSERT INTO alert_dismissals (owner_id, alert_key, dismissed_at)
  SELECT DISTINCT u.coach_id,
         'milestone_tech_setup:' || rp.student_id::text,
         now()
  FROM roadmap_progress rp
  JOIN users u ON u.id = rp.student_id
  WHERE rp.step_number = 4
    AND rp.status = 'completed'
    AND u.coach_id IS NOT NULL
    AND u.status = 'active'
    AND u.role IN ('student', 'student_diy')
  ON CONFLICT (owner_id, alert_key) DO NOTHING;
END $backfill$;

-- -----------------------------------------------------------------------------
-- 4. Post-asserts
-- -----------------------------------------------------------------------------

-- ASSERT A: exactly one get_coach_milestones overload remains (PGRST203 guard).
DO $assert_a$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_coach_milestones';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Migration 00034 post-assert A failed: get_coach_milestones has % overloads (expected 1)', v_count;
  END IF;
END $assert_a$;

-- ASSERT B: every active coach sees zero tech_setup rows post-backfill.
--           Enforces CA-05: no retroactive flood for historical Step-4 completions.
DO $assert_b$
DECLARE
  v_coach_id uuid;
  v_payload  jsonb;
  v_tech_rows int;
  v_violator uuid;
  v_total_tech int := 0;
BEGIN
  FOR v_coach_id IN
    SELECT id FROM users WHERE role = 'coach' AND status = 'active'
  LOOP
    v_payload := public.get_coach_milestones(v_coach_id, CURRENT_DATE, true);
    SELECT count(*) INTO v_tech_rows
      FROM jsonb_array_elements(v_payload->'milestones') e
     WHERE e->>'milestone_type' = 'tech_setup';
    IF v_tech_rows > 0 THEN
      v_violator := v_coach_id;
      v_total_tech := v_tech_rows;
      EXIT;
    END IF;
  END LOOP;

  IF v_violator IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 00034 post-assert B failed: coach % sees % tech_setup rows after backfill (expected 0)',
      v_violator, v_total_tech;
  END IF;
END $assert_b$;

COMMIT;
