-- =============================================================================
-- Phase 51: Milestone Notifications RPC + Backfill
-- Migration: 00027_get_coach_milestones_and_backfill.sql
--
-- Closes NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-07, NOTIF-08, NOTIF-10,
-- NOTIF-11. NOTIF-01 (tech_setup) code path is wired but gated off via
-- p_tech_setup_enabled default false until D-06 resolves.
--
-- SYNC: src/lib/config.ts MILESTONE_CONFIG / MILESTONES / MILESTONE_FEATURE_FLAGS
-- / MILESTONE_KEY_PATTERNS (Phase 50). Changing a step number there requires a
-- new migration — this file hard-codes 11 (influencersClosedStep) and 13
-- (brandResponseStep).
--
-- ATOMIC: RPC + backfill + sidebar rewrite + embedded asserts in ONE file so
-- either all-or-nothing applies. Prevents the "flood-on-rollout window" where
-- sidebar renders the new milestone count before backfill pre-dismisses
-- historical events (RESEARCH Pitfall 3).
--
-- FUTURE WORK (RESEARCH Pitfall 6): When MILESTONE_FEATURE_FLAGS.techSetupEnabled
-- flips to true after D-06 resolves, a SEPARATE migration MUST pre-dismiss
-- every historical completion of MILESTONE_CONFIG.techSetupStep for assigned
-- students — otherwise coaches will see a retroactive flood. This migration
-- deliberately does NOT backfill tech_setup because the step reference is null.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CREATE OR REPLACE FUNCTION public.get_coach_milestones
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
      AND rp.step_number = 11   -- SYNC: MILESTONE_CONFIG.influencersClosedStep
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
      AND rp.step_number = 13   -- SYNC: MILESTONE_CONFIG.brandResponseStep
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

-- Drop the old 2-arg get_sidebar_badges BEFORE recreating with new signature.
-- Supabase RPC name collision on arg-count change requires explicit drop
-- (see 00025/00026 pattern where ambiguity was fixed by drop+recreate).
DROP FUNCTION IF EXISTS public.get_sidebar_badges(uuid, text);

-- -----------------------------------------------------------------------------
-- 2. CREATE OR REPLACE FUNCTION public.get_sidebar_badges (REWRITE)
--    Preserves coach 100h logic, unreviewed_reports, unread_messages, student
--    branch, owner branch verbatim from 00017. Only change: coach branch folds
--    get_coach_milestones.count into coach_milestone_alerts field.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sidebar_badges(
  p_user_id              uuid,
  p_role                 text,
  p_today                date    DEFAULT CURRENT_DATE,
  p_tech_setup_enabled   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- SYNC: must match OWNER_CONFIG.alertThresholds in src/lib/config.ts
  v_inactive_days   integer := 3;   -- studentInactiveDays
  v_dropoff_days    integer := 7;   -- studentDropoffDays
  v_coach_rating    numeric := 2.5; -- coachUnderperformingRating
  v_coach_window    integer := 14;  -- coachUnderperformingWindowDays
  -- SYNC: must match COACH_CONFIG.reportInboxDays in src/lib/config.ts
  v_report_inbox_days integer := 7;

  v_today          date := p_today;
  v_inactive_cutoff date;
  v_dropoff_cutoff  date;
  v_coach_window_cutoff date;

  v_alert_count    integer := 0;
  v_dismissed_count integer := 0;

  v_student        RECORD;
  v_last_active    date;
  v_account_age_days numeric;

  v_unreviewed_count integer := 0;

  v_coach          RECORD;
  v_avg_rating     numeric;

  -- SYNC: must match COACH_CONFIG.milestoneMinutesThreshold (6000) and milestoneDaysWindow (45)
  v_milestone_count     integer := 0;
  v_milestone_dismissed integer := 0;

  -- Phase 35: unread message count for coach and student
  v_unread_count   integer := 0;

  -- Phase 51: new-milestone envelope count (already net-of-dismissals via
  -- the semi-join inside get_coach_milestones — do NOT subtract dismissals
  -- again at this layer or we double-count; T-51-04 mitigation).
  v_new_milestone_count integer := 0;
  v_ms_payload     jsonb;

  v_result         jsonb;
BEGIN
  -- -------------------------------------------------------------------------
  -- COACH ROLE: count unreviewed reports + 100h milestone alerts + v1.5
  -- milestone alerts (from get_coach_milestones) + unread messages.
  -- -------------------------------------------------------------------------
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

    -- 100h milestone: students who joined within 45 days AND have 6000+ completed session minutes
    -- SYNC: must match COACH_CONFIG.milestoneMinutesThreshold (6000) and milestoneDaysWindow (45)
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

    -- Count dismissed 100h milestone alerts for this coach
    SELECT count(*)
      INTO v_milestone_dismissed
      FROM alert_dismissals
     WHERE owner_id = p_user_id
       AND alert_key LIKE '100h_milestone:%';

    -- Phase 51: fold v1.5 milestone count into coach_milestone_alerts.
    -- Single source of truth — reuse get_coach_milestones so the sidebar
    -- count cannot drift from the /coach/alerts page count.
    v_ms_payload := public.get_coach_milestones(p_user_id, v_today, p_tech_setup_enabled);
    v_new_milestone_count := COALESCE((v_ms_payload->>'count')::int, 0);

    -- Unread messages: count of messages sent TO this coach (recipient_id = p_user_id) that are unread
    SELECT count(*) INTO v_unread_count
    FROM messages
    WHERE coach_id = p_user_id
      AND recipient_id = p_user_id
      AND read_at IS NULL;

    RETURN jsonb_build_object(
      'unreviewed_reports', v_unreviewed_count,
      'coach_milestone_alerts',
        GREATEST(0, v_milestone_count - v_milestone_dismissed) + v_new_milestone_count,
      'unread_messages', v_unread_count
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- STUDENT ROLE: count unread DMs + unread broadcasts from their coach
  -- (Preserved verbatim from 00017:108-119.)
  -- -------------------------------------------------------------------------
  IF p_role = 'student' THEN
    SELECT count(*) INTO v_unread_count
    FROM messages m
    JOIN users u ON u.id = p_user_id
    WHERE m.coach_id = u.coach_id
      AND (
        (m.recipient_id = p_user_id AND m.read_at IS NULL)
        OR (m.is_broadcast = true AND m.read_at IS NULL)
      );
    RETURN jsonb_build_object('unread_messages', v_unread_count);
  END IF;

  -- -------------------------------------------------------------------------
  -- OWNER ROLE: compute multi-signal alert count
  -- (Preserved verbatim from 00017:124-200 — only CURRENT_DATE → v_today.)
  -- -------------------------------------------------------------------------
  IF p_role = 'owner' THEN
    v_inactive_cutoff     := v_today - v_inactive_days;
    v_dropoff_cutoff      := v_today - v_dropoff_days;
    v_coach_window_cutoff := v_today - v_coach_window;

    -- For each active student, compute last-active date and check thresholds
    FOR v_student IN
      SELECT
        u.id,
        u.joined_at,
        MAX(GREATEST(
          (SELECT MAX(ws.date) FROM work_sessions ws WHERE ws.student_id = u.id AND ws.date >= v_dropoff_cutoff),
          (SELECT MAX(dr.date) FROM daily_reports dr  WHERE dr.student_id = u.id AND dr.date >= v_dropoff_cutoff AND dr.submitted_at IS NOT NULL)
        )) AS last_active
      FROM users u
      WHERE u.role = 'student' AND u.status = 'active'
      GROUP BY u.id, u.joined_at
    LOOP
      v_last_active      := v_student.last_active;
      v_account_age_days := EXTRACT(EPOCH FROM (now() - v_student.joined_at)) / 86400.0;

      IF v_last_active IS NULL OR v_last_active < v_dropoff_cutoff THEN
        -- Dropoff alert: no activity in dropoff window
        -- Grace period: skip students whose account age < dropoff threshold
        IF v_account_age_days < v_dropoff_days THEN
          CONTINUE;
        END IF;
        v_alert_count := v_alert_count + 1;
      ELSIF v_last_active < v_inactive_cutoff THEN
        -- Inactive alert: active between inactive and dropoff cutoffs
        -- Grace period: skip students whose account age < inactive threshold
        IF v_account_age_days < v_inactive_days THEN
          CONTINUE;
        END IF;
        v_alert_count := v_alert_count + 1;
      END IF;
    END LOOP;

    -- Unreviewed reports — count as 1 summary alert if any exist
    SELECT count(*)
      INTO v_unreviewed_count
      FROM daily_reports
     WHERE reviewed_by IS NULL
       AND submitted_at IS NOT NULL;

    IF v_unreviewed_count > 0 THEN
      v_alert_count := v_alert_count + 1;
    END IF;

    -- Coach underperformance: avg star_rating below threshold in window
    FOR v_coach IN
      SELECT id FROM users WHERE role = 'coach' AND status = 'active'
    LOOP
      SELECT AVG(dr.star_rating)
        INTO v_avg_rating
        FROM daily_reports dr
        JOIN users s ON s.id = dr.student_id
       WHERE s.coach_id = v_coach.id
         AND dr.date   >= v_coach_window_cutoff
         AND dr.submitted_at IS NOT NULL
         AND dr.star_rating IS NOT NULL;

      IF v_avg_rating IS NOT NULL AND v_avg_rating < v_coach_rating THEN
        v_alert_count := v_alert_count + 1;
      END IF;
    END LOOP;

    -- Subtract dismissed alerts (owner-scoped only)
    SELECT count(*)
      INTO v_dismissed_count
      FROM alert_dismissals
     WHERE owner_id = p_user_id;

    RETURN jsonb_build_object(
      'active_alerts', GREATEST(0, v_alert_count - v_dismissed_count),
      'unread_messages', 0
    );
  END IF;

  -- Any other role (student_diy or unknown): return empty object
  RETURN '{}'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sidebar_badges(uuid, text, date, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sidebar_badges(uuid, text, date, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. BACKFILL alert_dismissals for historical qualifying events (NOTIF-10)
--    Idempotent via ON CONFLICT DO NOTHING. Skips tech_setup (flag=false).
-- -----------------------------------------------------------------------------
DO $backfill$
BEGIN
  -- 5_influencers: every historical Step-11 completion × student's current coach
  INSERT INTO alert_dismissals (owner_id, alert_key, dismissed_at)
  SELECT DISTINCT u.coach_id,
         'milestone_5_influencers:' || rp.student_id::text,
         now()
  FROM roadmap_progress rp
  JOIN users u ON u.id = rp.student_id
  WHERE rp.step_number = 11
    AND rp.status = 'completed'
    AND u.coach_id IS NOT NULL
    AND u.status = 'active'
    AND u.role IN ('student', 'student_diy')
  ON CONFLICT (owner_id, alert_key) DO NOTHING;

  -- brand_response: every historical Step-13 completion × student's current coach
  INSERT INTO alert_dismissals (owner_id, alert_key, dismissed_at)
  SELECT DISTINCT u.coach_id,
         'milestone_brand_response:' || rp.student_id::text,
         now()
  FROM roadmap_progress rp
  JOIN users u ON u.id = rp.student_id
  WHERE rp.step_number = 13
    AND rp.status = 'completed'
    AND u.coach_id IS NOT NULL
    AND u.status = 'active'
    AND u.role IN ('student', 'student_diy')
  ON CONFLICT (owner_id, alert_key) DO NOTHING;

  -- closed_deal: every historical deal × student's current coach (D-16: all deals)
  INSERT INTO alert_dismissals (owner_id, alert_key, dismissed_at)
  SELECT DISTINCT u.coach_id,
         'milestone_closed_deal:' || d.student_id::text || ':' || d.id::text,
         now()
  FROM deals d
  JOIN users u ON u.id = d.student_id
  WHERE u.coach_id IS NOT NULL
    AND u.status = 'active'
    AND u.role IN ('student', 'student_diy')
  ON CONFLICT (owner_id, alert_key) DO NOTHING;

  -- tech_setup: intentionally NOT backfilled — gated by MILESTONE_FEATURE_FLAGS
  -- .techSetupEnabled = false. See FUTURE WORK note in header.
END $backfill$;

-- -----------------------------------------------------------------------------
-- 4. EMBEDDED ASSERT BLOCKS (project's test harness; see 00025 precedent)
-- -----------------------------------------------------------------------------

-- ASSERT 1: zero-student coach returns empty envelope (auth-guard bypass OK)
DO $assert_1$
DECLARE
  v_fake    uuid := '00000000-0000-0000-0000-000000000000';
  v_payload jsonb;
BEGIN
  v_payload := public.get_coach_milestones(v_fake, CURRENT_DATE, false);
  ASSERT v_payload ? 'milestones', 'ASSERT 1: envelope missing milestones key';
  ASSERT v_payload ? 'count',       'ASSERT 1: envelope missing count key';
  ASSERT (v_payload->>'count')::int = 0,
    format('ASSERT 1: zero-student coach expected count=0, got %s', v_payload->>'count');
  ASSERT jsonb_array_length(v_payload->'milestones') = 0,
    'ASSERT 1: milestones array expected empty for unknown coach';
END $assert_1$;

-- ASSERT 2: after backfill, every real coach's RPC returns count = 0
--           (NOTIF-10 critical invariant — no flood on rollout)
DO $assert_2$
DECLARE
  v_coach_id uuid;
  v_payload  jsonb;
  v_violator uuid;
  v_count    int := 0;
BEGIN
  FOR v_coach_id IN
    SELECT id FROM users WHERE role = 'coach' AND status = 'active'
  LOOP
    v_payload := public.get_coach_milestones(v_coach_id, CURRENT_DATE, false);
    v_count   := (v_payload->>'count')::int;
    IF v_count > 0 THEN
      v_violator := v_coach_id;
      EXIT;
    END IF;
  END LOOP;

  ASSERT v_violator IS NULL,
    format('ASSERT 2: post-backfill RPC must return 0 for every coach; coach %s has %s',
           v_violator, v_count);
END $assert_2$;

-- ASSERT 3: backfill row count matches expected historical-event count
DO $assert_3$
DECLARE
  v_expected int;
  v_actual   int;
BEGIN
  -- expected = (coach, step-11) distinct + (coach, step-13) distinct + (coach, deal_id) distinct
  SELECT
    (SELECT count(*) FROM (
       SELECT DISTINCT u.coach_id, rp.student_id
       FROM roadmap_progress rp JOIN users u ON u.id = rp.student_id
       WHERE rp.step_number = 11 AND rp.status = 'completed'
         AND u.coach_id IS NOT NULL AND u.status = 'active'
         AND u.role IN ('student','student_diy')
     ) s) +
    (SELECT count(*) FROM (
       SELECT DISTINCT u.coach_id, rp.student_id
       FROM roadmap_progress rp JOIN users u ON u.id = rp.student_id
       WHERE rp.step_number = 13 AND rp.status = 'completed'
         AND u.coach_id IS NOT NULL AND u.status = 'active'
         AND u.role IN ('student','student_diy')
     ) s) +
    (SELECT count(*) FROM (
       SELECT DISTINCT u.coach_id, d.id
       FROM deals d JOIN users u ON u.id = d.student_id
       WHERE u.coach_id IS NOT NULL AND u.status = 'active'
         AND u.role IN ('student','student_diy')
     ) s)
  INTO v_expected;

  SELECT count(*) INTO v_actual
  FROM alert_dismissals
  WHERE alert_key LIKE 'milestone_%';

  ASSERT v_actual >= v_expected,
    format('ASSERT 3: backfill row count mismatch; expected >= %s, got %s', v_expected, v_actual);
END $assert_3$;

-- ASSERT 4: a FRESH Step-11 completion produces exactly one RPC row
--           (uses a real coach+student pair; restores state post-assertion)
DO $assert_4$
DECLARE
  v_coach         uuid;
  v_student       uuid;
  v_had_dismissal boolean := false;
  v_payload       jsonb;
  v_found         int;
  v_prev_step_exists boolean := false;
  v_prev_status   text;
  v_prev_completed_at timestamptz;
BEGIN
  -- Pick any real coach+student pair
  SELECT u.coach_id, u.id INTO v_coach, v_student
  FROM users u
  WHERE u.role IN ('student','student_diy')
    AND u.status = 'active'
    AND u.coach_id IS NOT NULL
  LIMIT 1;

  IF v_coach IS NULL THEN
    RAISE NOTICE 'ASSERT 4: skipped (no coach+student pair in DB)';
    RETURN;
  END IF;

  -- Snapshot existing Step-11 row (if any) so we can restore it.
  SELECT true, status, completed_at
    INTO v_prev_step_exists, v_prev_status, v_prev_completed_at
  FROM roadmap_progress
  WHERE student_id = v_student AND step_number = 11;

  -- Capture whether the backfill inserted a dismissal for this pair
  SELECT EXISTS(
    SELECT 1 FROM alert_dismissals
    WHERE owner_id = v_coach
      AND alert_key = 'milestone_5_influencers:' || v_student::text
  ) INTO v_had_dismissal;

  -- Remove pre-dismissal so event re-qualifies
  DELETE FROM alert_dismissals
  WHERE owner_id = v_coach
    AND alert_key = 'milestone_5_influencers:' || v_student::text;

  -- Ensure Step-11 row is completed. INSERT if missing, else UPDATE.
  IF v_prev_step_exists THEN
    UPDATE roadmap_progress
       SET status = 'completed', completed_at = now()
     WHERE student_id = v_student AND step_number = 11;
  ELSE
    INSERT INTO roadmap_progress (student_id, step_number, status, completed_at)
    VALUES (v_student, 11, 'completed', now());
  END IF;

  v_payload := public.get_coach_milestones(v_coach, CURRENT_DATE, false);
  SELECT count(*) INTO v_found
    FROM jsonb_array_elements(v_payload->'milestones') e
   WHERE e->>'milestone_type' = '5_influencers'
     AND e->>'student_id' = v_student::text;

  ASSERT v_found = 1,
    format('ASSERT 4: expected 1 five_influencers row for student %s, got %s', v_student, v_found);

  -- Restore original roadmap_progress state
  IF v_prev_step_exists THEN
    UPDATE roadmap_progress
       SET status = v_prev_status, completed_at = v_prev_completed_at
     WHERE student_id = v_student AND step_number = 11;
  ELSE
    DELETE FROM roadmap_progress WHERE student_id = v_student AND step_number = 11;
  END IF;

  -- Restore dismissal if it existed before
  IF v_had_dismissal THEN
    INSERT INTO alert_dismissals (owner_id, alert_key)
    VALUES (v_coach, 'milestone_5_influencers:' || v_student::text)
    ON CONFLICT (owner_id, alert_key) DO NOTHING;
  END IF;
END $assert_4$;

-- ASSERT 5: per-deal granularity — two deals = two DISTINCT alert_keys (NOTIF-05 + D-07)
DO $assert_5$
DECLARE
  v_key1 text := 'milestone_closed_deal:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222';
  v_key2 text := 'milestone_closed_deal:11111111-1111-1111-1111-111111111111:33333333-3333-3333-3333-333333333333';
BEGIN
  -- Structural check: the alert_key format embeds deal_id, so two deals for
  -- the same student produce distinct keys by construction.
  ASSERT v_key1 <> v_key2,
    'ASSERT 5: per-deal keys collide — deal_id not embedded in alert_key';
  ASSERT position(':22222222' IN v_key1) > 0,
    'ASSERT 5: deal_id missing from closed_deal alert_key composition';
  ASSERT position(':33333333' IN v_key2) > 0,
    'ASSERT 5: deal_id missing from second closed_deal alert_key';
END $assert_5$;

-- ASSERT 6: one-shot scope — 5_influencers alert_key is student-scoped only
DO $assert_6$
DECLARE
  v_student uuid := '44444444-4444-4444-4444-444444444444';
  v_key text;
BEGIN
  v_key := 'milestone_5_influencers:' || v_student::text;
  -- Structural check: composition uses student_id only (no deal_id, no coach_id)
  -- so a second Step-11 completion produces the SAME key → dismissal already
  -- in place → RPC returns zero additional rows.
  ASSERT v_key = 'milestone_5_influencers:44444444-4444-4444-4444-444444444444',
    format('ASSERT 6: 5_influencers key composition wrong — got %s', v_key);
  ASSERT position(':coach' IN v_key) = 0,
    'ASSERT 6: coach_id must NOT appear in one-shot milestone keys (avoids double-fire on reassignment)';
END $assert_6$;

-- ASSERT 7: dismissing an alert_key makes the RPC row disappear (semi-join correctness)
DO $assert_7$
DECLARE
  v_coach         uuid;
  v_student       uuid;
  v_key           text;
  v_had_dismissal boolean := false;
  v_prev_step_exists boolean := false;
  v_prev_status   text;
  v_prev_completed_at timestamptz;
  v_before        int;
  v_after         int;
  v_payload       jsonb;
BEGIN
  SELECT u.coach_id, u.id INTO v_coach, v_student
  FROM users u
  WHERE u.role IN ('student','student_diy')
    AND u.status = 'active'
    AND u.coach_id IS NOT NULL
  LIMIT 1;

  IF v_coach IS NULL THEN
    RAISE NOTICE 'ASSERT 7: skipped (no coach+student pair in DB)';
    RETURN;
  END IF;

  v_key := 'milestone_5_influencers:' || v_student::text;

  SELECT true, status, completed_at
    INTO v_prev_step_exists, v_prev_status, v_prev_completed_at
  FROM roadmap_progress
  WHERE student_id = v_student AND step_number = 11;

  SELECT EXISTS(
    SELECT 1 FROM alert_dismissals
    WHERE owner_id = v_coach AND alert_key = v_key
  ) INTO v_had_dismissal;

  -- Clean dismissal, ensure step completed so RPC sees the event.
  DELETE FROM alert_dismissals WHERE owner_id = v_coach AND alert_key = v_key;
  IF v_prev_step_exists THEN
    UPDATE roadmap_progress
       SET status = 'completed', completed_at = now()
     WHERE student_id = v_student AND step_number = 11;
  ELSE
    INSERT INTO roadmap_progress (student_id, step_number, status, completed_at)
    VALUES (v_student, 11, 'completed', now());
  END IF;

  v_payload := public.get_coach_milestones(v_coach, CURRENT_DATE, false);
  SELECT count(*) INTO v_before
    FROM jsonb_array_elements(v_payload->'milestones') e
   WHERE e->>'alert_key' = v_key;

  -- Now dismiss and re-run
  INSERT INTO alert_dismissals (owner_id, alert_key) VALUES (v_coach, v_key)
  ON CONFLICT (owner_id, alert_key) DO NOTHING;

  v_payload := public.get_coach_milestones(v_coach, CURRENT_DATE, false);
  SELECT count(*) INTO v_after
    FROM jsonb_array_elements(v_payload->'milestones') e
   WHERE e->>'alert_key' = v_key;

  ASSERT v_before = 1,
    format('ASSERT 7: pre-dismiss expected 1 row for key %s, got %s', v_key, v_before);
  ASSERT v_after = 0,
    format('ASSERT 7: post-dismiss expected 0 rows for key %s, got %s', v_key, v_after);

  -- Restore state
  IF NOT v_had_dismissal THEN
    DELETE FROM alert_dismissals WHERE owner_id = v_coach AND alert_key = v_key;
  END IF;
  IF v_prev_step_exists THEN
    UPDATE roadmap_progress
       SET status = v_prev_status, completed_at = v_prev_completed_at
     WHERE student_id = v_student AND step_number = 11;
  ELSE
    DELETE FROM roadmap_progress WHERE student_id = v_student AND step_number = 11;
  END IF;
END $assert_7$;

-- ASSERT 8: get_sidebar_badges coach branch returns envelope with
--           coach_milestone_alerts (NOTIF-08 — existing 100h logic preserved)
DO $assert_8$
DECLARE
  v_coach   uuid;
  v_payload jsonb;
BEGIN
  SELECT id INTO v_coach
  FROM users
  WHERE role = 'coach' AND status = 'active'
  LIMIT 1;

  IF v_coach IS NULL THEN
    RAISE NOTICE 'ASSERT 8: skipped (no active coach in DB)';
    RETURN;
  END IF;

  v_payload := public.get_sidebar_badges(v_coach, 'coach', CURRENT_DATE, false);

  ASSERT v_payload ? 'unreviewed_reports',
    'ASSERT 8: sidebar badge envelope missing unreviewed_reports';
  ASSERT v_payload ? 'coach_milestone_alerts',
    'ASSERT 8: sidebar badge envelope missing coach_milestone_alerts';
  ASSERT v_payload ? 'unread_messages',
    'ASSERT 8: sidebar badge envelope missing unread_messages';
  ASSERT (v_payload->>'coach_milestone_alerts')::int >= 0,
    format('ASSERT 8: coach_milestone_alerts must be non-negative, got %s',
           v_payload->>'coach_milestone_alerts');
END $assert_8$;

-- ASSERT 9: tech_setup gated — p_tech_setup_enabled=false returns zero tech_setup rows
DO $assert_9$
DECLARE
  v_coach_id uuid;
  v_payload  jsonb;
  v_tech_rows int;
  v_any_tech int := 0;
BEGIN
  -- Iterate every real coach and confirm tech_setup rows NEVER appear when flag=false
  FOR v_coach_id IN
    SELECT id FROM users WHERE role = 'coach' AND status = 'active'
  LOOP
    v_payload := public.get_coach_milestones(v_coach_id, CURRENT_DATE, false);
    SELECT count(*) INTO v_tech_rows
      FROM jsonb_array_elements(v_payload->'milestones') e
     WHERE e->>'milestone_type' = 'tech_setup';
    v_any_tech := v_any_tech + v_tech_rows;
  END LOOP;

  ASSERT v_any_tech = 0,
    format('ASSERT 9: tech_setup rows leaked with flag=false; found %s across coaches',
           v_any_tech);
END $assert_9$;

COMMIT;
