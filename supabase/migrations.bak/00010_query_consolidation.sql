-- ============================================================================
-- Phase 20: Query Consolidation RPC Functions
-- Migration: 00010_query_consolidation.sql
--
-- Three SECURITY DEFINER functions called via service_role (admin client).
-- All are STABLE (read-only). Return JSONB for clean TypeScript consumption.
--
-- SYNC: Threshold constants must match src/lib/config.ts
--   OWNER_CONFIG.alertThresholds: inactive=3, dropoff=7, coachRating=2.5, coachWindow=14
--   COACH_CONFIG.reportInboxDays: 7
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Function 1: get_owner_dashboard_stats()
-- Consolidates 4 parallel queries from src/app/(dashboard)/owner/page.tsx
-- into a single round trip.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_owner_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_students',     (SELECT count(*) FROM users WHERE role = 'student' AND status = 'active'),
    'total_coaches',      (SELECT count(*) FROM users WHERE role = 'coach' AND status = 'active'),
    'active_today_count', (SELECT count(DISTINCT student_id) FROM work_sessions WHERE date = v_today),
    'reports_today',      (SELECT count(*) FROM daily_reports WHERE date = v_today AND submitted_at IS NOT NULL)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function 2: get_sidebar_badges(p_user_id uuid, p_role text)
-- Consolidates sidebar badge computation from src/app/(dashboard)/layout.tsx
-- Owner: 7 queries → 1 RPC. Coach: 2 queries → 1 RPC.
--
-- SYNC: must match OWNER_CONFIG.alertThresholds in src/lib/config.ts
--   studentInactiveDays: 3
--   studentDropoffDays: 7
--   coachUnderperformingRating: 2.5
--   coachUnderperformingWindowDays: 14
-- SYNC: must match COACH_CONFIG.reportInboxDays in src/lib/config.ts
--   reportInboxDays: 7
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sidebar_badges(p_user_id uuid, p_role text)
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

  v_today          date := CURRENT_DATE;
  v_inactive_cutoff date;
  v_dropoff_cutoff  date;
  v_coach_window_cutoff date;
  v_inbox_cutoff   date;

  v_alert_count    integer := 0;
  v_dismissed_count integer := 0;

  v_student        RECORD;
  v_last_active    date;
  v_account_age_days numeric;

  v_unreviewed_count integer := 0;

  v_coach          RECORD;
  v_avg_rating     numeric;

  v_result         jsonb;
BEGIN
  -- -------------------------------------------------------------------------
  -- COACH ROLE: count unreviewed reports from coach's students in inbox window
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

    RETURN jsonb_build_object('unreviewed_reports', v_unreviewed_count);
  END IF;

  -- -------------------------------------------------------------------------
  -- OWNER ROLE: compute multi-signal alert count
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

    -- Subtract dismissed alerts
    SELECT count(*)
      INTO v_dismissed_count
      FROM alert_dismissals
     WHERE owner_id = p_user_id;

    RETURN jsonb_build_object('active_alerts', GREATEST(0, v_alert_count - v_dismissed_count));
  END IF;

  -- Any other role: return empty object
  RETURN '{}'::jsonb;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function 3: get_student_detail(p_student_id, p_month_start, p_month_end, p_include_coach_mgmt)
-- Shared function for both coach and owner student detail pages.
-- Consolidates 9 coach queries and 11 owner queries into 1 RPC each.
-- p_include_coach_mgmt = true adds coaches list + student_counts (owner only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_detail(
  p_student_id       uuid,
  p_month_start      date,
  p_month_end        date,
  p_include_coach_mgmt boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today          date    := CURRENT_DATE;
  v_seven_days_ago date    := v_today - 7;

  v_sessions       jsonb;
  v_roadmap        jsonb;
  v_reports        jsonb;
  v_lifetime_outreach bigint;
  v_today_outreach    bigint;
  v_today_minutes     bigint;
  v_latest_session_date date;
  v_latest_report_date  date;
  v_recent_ratings jsonb;
  v_coaches        jsonb := NULL;
  v_student_counts jsonb := NULL;

  v_result         jsonb;
BEGIN
  -- Month-scoped sessions
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',               id,
      'date',             date,
      'cycle_number',     cycle_number,
      'status',           status,
      'duration_minutes', duration_minutes,
      'session_minutes',  session_minutes
    ) ORDER BY date, cycle_number
  ), '[]'::jsonb)
  INTO v_sessions
  FROM work_sessions
  WHERE student_id = p_student_id
    AND date >= p_month_start
    AND date <= p_month_end;

  -- Full roadmap progress
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'step_number',  step_number,
      'status',       status,
      'completed_at', completed_at
    ) ORDER BY step_number
  ), '[]'::jsonb)
  INTO v_roadmap
  FROM roadmap_progress
  WHERE student_id = p_student_id;

  -- Month-scoped reports with all KPI fields
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                    id,
      'date',                  date,
      'hours_worked',          hours_worked,
      'star_rating',           star_rating,
      'brands_contacted',      brands_contacted,
      'influencers_contacted', influencers_contacted,
      'calls_joined',          calls_joined,
      'wins',                  wins,
      'improvements',          improvements,
      'reviewed_by',           reviewed_by
    ) ORDER BY date
  ), '[]'::jsonb)
  INTO v_reports
  FROM daily_reports
  WHERE student_id = p_student_id
    AND date >= p_month_start
    AND date <= p_month_end;

  -- Lifetime outreach: SUM over ALL daily_reports for this student
  SELECT COALESCE(SUM(brands_contacted + influencers_contacted), 0)
  INTO v_lifetime_outreach
  FROM daily_reports
  WHERE student_id = p_student_id;

  -- Today's outreach from today's report
  SELECT COALESCE(SUM(brands_contacted + influencers_contacted), 0)
  INTO v_today_outreach
  FROM daily_reports
  WHERE student_id = p_student_id
    AND date = v_today;

  -- Today's completed session minutes
  SELECT COALESCE(SUM(duration_minutes), 0)
  INTO v_today_minutes
  FROM work_sessions
  WHERE student_id = p_student_id
    AND date = v_today
    AND status = 'completed';

  -- Latest session date
  SELECT MAX(date)
  INTO v_latest_session_date
  FROM work_sessions
  WHERE student_id = p_student_id;

  -- Latest report date
  SELECT MAX(date)
  INTO v_latest_report_date
  FROM daily_reports
  WHERE student_id = p_student_id;

  -- Recent ratings (last 7 days, non-null)
  SELECT COALESCE(jsonb_agg(star_rating ORDER BY date DESC), '[]'::jsonb)
  INTO v_recent_ratings
  FROM daily_reports
  WHERE student_id = p_student_id
    AND date >= v_seven_days_ago
    AND star_rating IS NOT NULL;

  -- Owner-only: coaches list + student counts per coach
  IF p_include_coach_mgmt THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('id', id, 'name', name)
      ORDER BY name
    ), '[]'::jsonb)
    INTO v_coaches
    FROM users
    WHERE role = 'coach' AND status = 'active';

    SELECT COALESCE(
      jsonb_object_agg(coach_id::text, cnt),
      '{}'::jsonb
    )
    INTO v_student_counts
    FROM (
      SELECT coach_id, count(*) AS cnt
      FROM users
      WHERE role = 'student'
        AND status = 'active'
        AND coach_id IS NOT NULL
      GROUP BY coach_id
    ) sub;
  END IF;

  -- Build result object
  v_result := jsonb_build_object(
    'sessions',              v_sessions,
    'roadmap',               v_roadmap,
    'reports',               v_reports,
    'lifetime_outreach',     v_lifetime_outreach,
    'today_outreach',        v_today_outreach,
    'today_minutes_worked',  v_today_minutes,
    'latest_session_date',   v_latest_session_date,
    'latest_report_date',    v_latest_report_date,
    'recent_ratings',        v_recent_ratings
  );

  IF p_include_coach_mgmt THEN
    v_result := v_result
      || jsonb_build_object('coaches', v_coaches)
      || jsonb_build_object('student_counts', v_student_counts);
  END IF;

  RETURN v_result;
END;
$$;
