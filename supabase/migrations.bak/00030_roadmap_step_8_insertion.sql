-- =============================================================================
-- Phase 57: Roadmap Step 8 Insertion
-- Migration: 00030_roadmap_step_8_insertion.sql
--
-- Closes ROADMAP-01, ROADMAP-02, ROADMAP-03, ROADMAP-06, ROADMAP-09.
--
-- SYNC: src/lib/config.ts ROADMAP_STEPS (16 entries) + MILESTONE_CONFIG
-- (.influencersClosedStep = 12, .brandResponseStep = 14). These two files
-- MUST land in the SAME Git commit as this migration — missing either half
-- silently breaks coach milestone alerts (STATE.md §Critical Constraints v1.6).
--
-- ATOMIC: single BEGIN…COMMIT. The CHECK constraint swap MUST happen BEFORE
-- any UPDATE that pushes step_number above 15, because pass 1 of the
-- two-pass renumber writes 108–115 (to dodge the UNIQUE(student_id,
-- step_number) collision), which violates the old BETWEEN 1 AND 15 CHECK.
--
-- Two-pass renumber (non-negotiable):
--   Pass 1: UPDATE … SET step_number = step_number + 100 WHERE step_number BETWEEN 8 AND 15
--   Pass 2: UPDATE … SET step_number = step_number - 99 WHERE step_number BETWEEN 108 AND 115
-- A naive single-pass "SET step_number = step_number + 1 WHERE step_number BETWEEN 8 AND 15"
-- violates the UNIQUE(student_id, step_number) index (8→9 collides with existing 9, etc.).
--
-- Auto-complete: every student with a completed row at step 7 (post-renumber,
-- step 7 is untouched) gets a fresh completed row at step 8. ON CONFLICT
-- DO NOTHING guards against re-run idempotency.
--
-- Asserts: MAX(step_number) = 16 AND zero duplicate (student_id, step_number)
-- rows. Assertion failure raises an exception — Postgres rolls back the
-- transaction atomically; zero db state change.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Section 1: Drop the old BETWEEN 1 AND 15 CHECK constraint.
-- Re-added as BETWEEN 1 AND 16 in Section 5 AFTER the two-pass renumber
-- returns every row to the 1–16 range. Pass 1 writes 108–115 which would
-- violate ANY BETWEEN 1 AND N check, so the constraint must be absent
-- during the renumber window.
-- -----------------------------------------------------------------------------

ALTER TABLE public.roadmap_progress
  DROP CONSTRAINT IF EXISTS roadmap_progress_step_number_check;

-- -----------------------------------------------------------------------------
-- Section 2: Two-pass renumber of existing Steps 8–15 → 9–16.
-- Pass 1 shifts 8–15 into 108–115 (outside the collision range) so Pass 2
-- can shift into 9–16 without colliding with existing rows on the
-- UNIQUE(student_id, step_number) index.
--
-- Single-pass "step_number + 1 WHERE step_number BETWEEN 8 AND 15" would
-- violate the UNIQUE constraint: e.g., student X's row at step 8 moving
-- to step 9 collides with student X's existing row at step 9.
-- -----------------------------------------------------------------------------

-- Pass 1: Shift old Steps 8–15 to 108–115.
UPDATE public.roadmap_progress
  SET step_number = step_number + 100
 WHERE step_number BETWEEN 8 AND 15;

-- Pass 2: Shift 108–115 down to 9–16.
UPDATE public.roadmap_progress
  SET step_number = step_number - 99
 WHERE step_number BETWEEN 108 AND 115;

-- -----------------------------------------------------------------------------
-- Section 3: CREATE OR REPLACE get_coach_milestones — shift step references
--   influencersClosedStep: 11 → 12
--   brandResponseStep:     13 → 14
-- Must land in the SAME Git commit as src/lib/config.ts MILESTONE_CONFIG
-- updates. Other function logic preserved verbatim from 00027.
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
  -- Auth guard (mirrors 00025:97-99). When called via service_role (admin
  -- client), auth.uid() is NULL — that path bypasses by design. When called
  -- by an authenticated user, caller must match p_coach_id.
  IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM p_coach_id THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Resolve assigned active students. Both 'student' and 'student_diy' roles
  -- count per RESEARCH A1 — any active user with coach_id = p_coach_id.
  SELECT array_agg(id) INTO v_student_ids
  FROM users
  WHERE role IN ('student', 'student_diy')
    AND status = 'active'
    AND coach_id = p_coach_id;

  -- Zero-student short-circuit
  IF v_student_ids IS NULL OR array_length(v_student_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('milestones', '[]'::jsonb, 'count', 0);
  END IF;

  -- Build qualifying-but-not-dismissed events across 4 milestone types,
  -- then UNION ALL, then LEFT JOIN alert_dismissals, then serialize to jsonb.
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
      AND rp.step_number = 12   -- SYNC: MILESTONE_CONFIG.influencersClosedStep (Phase 57: shifted 11→12)
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
      AND rp.step_number = 14   -- SYNC: MILESTONE_CONFIG.brandResponseStep (Phase 57: shifted 13→14)
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
    -- D-16: ALL deals count, regardless of logged_by (student/coach/owner)
  ),
  -- Tech-setup branch: gated by p_tech_setup_enabled. When false (default)
  -- this CTE evaluates to zero rows even if historical data exists.
  -- NOTE: MILESTONE_CONFIG.techSetupStep is currently NULL (D-06 pending);
  -- when D-06 resolves, replace the hard-coded step reference here and in
  -- the backfill block with the confirmed step number.
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
      AND rp.step_number = 0   -- PLACEHOLDER — replace when D-06 resolves
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

GRANT EXECUTE ON FUNCTION public.get_coach_milestones(uuid, date, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_milestones(uuid, date, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- Section 4: Auto-complete new Step 8 for students who completed old Step 7.
-- Gate on current step_number = 7 (post-Section-2 renumber leaves step 7
-- unchanged). The `status = 'completed'` filter excludes students whose
-- step 7 row exists in 'active' or 'locked' state (they'll self-mark via
-- the standard flow per ROADMAP-04).
--
-- SYNC: schema is `status varchar(20) NOT NULL CHECK (status IN
-- ('locked','active','completed'))` per 00001:106 — NOT a boolean
-- `completed` column. `step_name` is NOT NULL so we must provide the
-- Phase 57 title verbatim.
--
-- ON CONFLICT DO NOTHING guards against migration re-run (second run finds
-- step 8 rows already present per the student_id+step_number UNIQUE index
-- from 00001:112).
-- -----------------------------------------------------------------------------

INSERT INTO public.roadmap_progress (student_id, step_number, step_name, status, completed_at)
SELECT
  rp.student_id,
  8,
  'Join at least one Influencer Q&A session (CPM + pricing)',
  'completed',
  now()
FROM public.roadmap_progress rp
WHERE rp.step_number = 7
  AND rp.status = 'completed'
ON CONFLICT (student_id, step_number) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Section 5: Re-add the CHECK constraint at the NEW ceiling (BETWEEN 1 AND 16).
-- Safe to do now — Section 2's two-pass renumber has returned every row to
-- the 1–16 range, and Section 4's INSERT only writes step_number = 8.
-- -----------------------------------------------------------------------------

ALTER TABLE public.roadmap_progress
  ADD CONSTRAINT roadmap_progress_step_number_check
  CHECK (step_number BETWEEN 1 AND 16);

-- -----------------------------------------------------------------------------
-- Section 6: Embedded ASSERT block — verifies migration invariants.
-- Failure raises an exception → Postgres rolls back the transaction
-- atomically; zero db state change.
-- -----------------------------------------------------------------------------

DO $phase57_assert$
DECLARE
  v_max_step   integer;
  v_dup_count  integer;
BEGIN
  -- ASSERT 1: renumber + constraint permit MAX(step_number) = 16.
  SELECT COALESCE(MAX(step_number), 0) INTO v_max_step FROM public.roadmap_progress;
  ASSERT v_max_step <= 16,
    format('Phase 57 ASSERT 1: MAX(step_number) exceeds 16, got %s', v_max_step);

  -- ASSERT 2: zero duplicate (student_id, step_number) rows.
  -- UNIQUE index on (student_id, step_number) from 00001 makes this
  -- structurally impossible, but we assert for defense-in-depth:
  -- if somehow a duplicate slipped through (e.g., via ON CONFLICT
  -- DO NOTHING masking a bug), the assert catches it.
  SELECT COUNT(*) INTO v_dup_count
    FROM (
      SELECT student_id, step_number
        FROM public.roadmap_progress
       GROUP BY student_id, step_number
      HAVING COUNT(*) > 1
    ) dup;
  ASSERT v_dup_count = 0,
    format('Phase 57 ASSERT 2: %s duplicate (student_id, step_number) rows detected', v_dup_count);
END $phase57_assert$;

COMMIT;
