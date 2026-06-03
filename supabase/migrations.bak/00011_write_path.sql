-- ============================================================================
-- Phase 21: Write Path Pre-Aggregation
-- Migration: 00011_write_path.sql
--
-- Four sections:
--   Section 0: Migration header comment — D-08 scope decision
--   Section 1: student_kpi_summaries table (D-01)
--   Section 2: refresh_student_kpi_summaries() function (D-04, D-05, D-06)
--   Section 3: pg_cron job registration (D-06) — idempotent
--   Section 4: Update get_student_detail RPC (D-07) — summary table switchover
-- ============================================================================

-- ============================================================================
-- Section 0: D-08 Scope Decision
--
-- D-08 scope note: The locked decision D-08 states "Coach analytics page reads
-- from summary table for report rate and outreach totals." After analysis of the
-- actual coach analytics page (src/app/(dashboard)/coach/analytics/page.tsx), all
-- four metrics are 7-day windowed:
--   1. Report submission rate = reports_in_7_days / (active_students * 7) * 100
--   2. Avg star rating = mean of star_rating over last 7 days of reports
--   3. Avg hours/day = mean of hours_worked over last 7 days of reports
--   4. Avg outreach = mean of outreach_count over last 7 days of reports
-- The student_kpi_summaries table stores LIFETIME totals (total_brands_contacted,
-- total_hours_worked, etc.), not 7-day windows. These are fundamentally different
-- denominators — lifetime total / N_reports != 7-day average. Therefore D-08 does
-- not apply to the current coach analytics metrics. If coach analytics adds
-- lifetime aggregate displays in the future, it should read from this table.
-- The total_reports column (per D-03) remains useful for a future "report rate
-- over entire program" metric (total_reports / days_in_program).
-- ============================================================================


-- ============================================================================
-- Section 1: student_kpi_summaries table (D-01)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.student_kpi_summaries (
  student_id               uuid         PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  total_brands_contacted   integer      NOT NULL DEFAULT 0,
  total_influencers_contacted integer   NOT NULL DEFAULT 0,
  total_hours_worked       numeric(8,2) NOT NULL DEFAULT 0,
  total_calls_joined       integer      NOT NULL DEFAULT 0,
  total_reports            integer      NOT NULL DEFAULT 0,
  last_active_date         date,                          -- NULL = student has never submitted
  current_streak           integer      NOT NULL DEFAULT 0,
  last_report_date         date,                          -- sentinel for incremental aggregation
  updated_at               timestamptz  NOT NULL DEFAULT now()
);

-- Enable RLS (table is read exclusively via SECURITY DEFINER RPCs using service_role)
-- No RLS policies needed — direct row access never occurs via authenticated JWT
ALTER TABLE public.student_kpi_summaries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.student_kpi_summaries IS
  'Pre-aggregated KPI summaries per student. Refreshed nightly at 2 AM UTC (6 AM UAE) by pg_cron job ''refresh-student-kpi-summaries''. Advisory lock key: 2100210021.';


-- ============================================================================
-- Section 2: refresh_student_kpi_summaries() aggregation function (D-04, D-05, D-06)
--
-- VOLATILE because it writes data (INSERT ... ON CONFLICT DO UPDATE).
-- SECURITY DEFINER runs as the function owner (service_role), bypassing RLS.
-- Advisory lock (key 2100210021) prevents concurrent runs if cron fires twice.
-- Incremental skip: students with no new daily_reports since last_report_date
-- are skipped to avoid full re-scan when nothing changed.
-- Full lifetime re-SUM is used (not delta arithmetic) for correctness —
-- report updates modify existing rows, so delta logic would be wrong.
-- Streak computed via PL/pgSQL date walk (backward from MAX date).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_student_kpi_summaries()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key              bigint := 2100210021;
  v_student               RECORD;
  v_has_new_activity      boolean;
  v_total_brands          bigint;
  v_total_influencers     bigint;
  v_total_hours           numeric;
  v_total_calls           bigint;
  v_total_reports         bigint;
  v_last_active           date;
  v_last_report           date;
  v_streak                integer;
  v_check_date            date;
  v_streak_date           date;
BEGIN
  -- Advisory lock: skip run if already running (prevents overlap from pg_cron double-fire)
  IF NOT pg_try_advisory_lock(v_lock_key) THEN
    RAISE NOTICE 'refresh_student_kpi_summaries: already running, skipping';
    RETURN;
  END IF;

  BEGIN  -- inner block so EXCEPTION handler can release the lock
    FOR v_student IN
      SELECT
        u.id                   AS student_id,
        s.last_report_date     AS existing_last_report
      FROM users u
      LEFT JOIN student_kpi_summaries s ON s.student_id = u.id
      WHERE u.role = 'student' AND u.status = 'active'
    LOOP
      -- -----------------------------------------------------------------------
      -- Incremental skip logic (D-04):
      -- If this student already has a summary row (existing_last_report IS NOT NULL)
      -- AND there are no new daily_reports rows since last_report_date,
      -- skip reprocessing — nothing has changed.
      -- -----------------------------------------------------------------------
      IF v_student.existing_last_report IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1
          FROM daily_reports
          WHERE student_id = v_student.student_id
            AND date > v_student.existing_last_report
            AND submitted_at IS NOT NULL
        ) INTO v_has_new_activity;

        IF NOT v_has_new_activity THEN
          CONTINUE;
        END IF;
      END IF;

      -- -----------------------------------------------------------------------
      -- Compute lifetime aggregates from all submitted daily_reports (D-04, D-05)
      -- Always re-SUM full lifetime for correctness (not delta arithmetic)
      -- -----------------------------------------------------------------------
      SELECT
        COALESCE(SUM(brands_contacted), 0),
        COALESCE(SUM(influencers_contacted), 0),
        COALESCE(SUM(hours_worked), 0),
        COALESCE(SUM(calls_joined), 0),
        COUNT(*),
        MAX(date)
      INTO
        v_total_brands,
        v_total_influencers,
        v_total_hours,
        v_total_calls,
        v_total_reports,
        v_last_active
      FROM daily_reports
      WHERE student_id = v_student.student_id
        AND submitted_at IS NOT NULL;

      -- last_report_date sentinel = MAX(date) of submitted reports
      v_last_report := v_last_active;

      -- -----------------------------------------------------------------------
      -- Streak computation (D-02):
      -- Walk backward from MAX(date), counting consecutive calendar days with
      -- a submitted daily_reports row. Stop when gap > 1 day is found.
      -- If MAX(date) < CURRENT_DATE - 1, the streak has already been broken today.
      -- -----------------------------------------------------------------------
      v_streak := 0;

      IF v_last_active IS NOT NULL THEN
        -- If the most recent report is from before yesterday, streak is already broken
        IF v_last_active < CURRENT_DATE - 1 THEN
          v_streak := 0;
        ELSE
          -- Walk backward day by day from v_last_active
          v_check_date := v_last_active;
          LOOP
            -- Check if a submitted report exists for this date
            SELECT date INTO v_streak_date
            FROM daily_reports
            WHERE student_id = v_student.student_id
              AND date = v_check_date
              AND submitted_at IS NOT NULL
            LIMIT 1;

            IF FOUND THEN
              v_streak := v_streak + 1;
              v_check_date := v_check_date - 1;
            ELSE
              -- Gap found — stop counting
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;

      -- -----------------------------------------------------------------------
      -- Idempotent upsert (D-06): INSERT ... ON CONFLICT (student_id) DO UPDATE
      -- -----------------------------------------------------------------------
      INSERT INTO student_kpi_summaries (
        student_id,
        total_brands_contacted,
        total_influencers_contacted,
        total_hours_worked,
        total_calls_joined,
        total_reports,
        last_active_date,
        current_streak,
        last_report_date,
        updated_at
      ) VALUES (
        v_student.student_id,
        v_total_brands,
        v_total_influencers,
        v_total_hours,
        v_total_calls,
        v_total_reports,
        v_last_active,
        v_streak,
        v_last_report,
        now()
      )
      ON CONFLICT (student_id) DO UPDATE SET
        total_brands_contacted      = EXCLUDED.total_brands_contacted,
        total_influencers_contacted = EXCLUDED.total_influencers_contacted,
        total_hours_worked          = EXCLUDED.total_hours_worked,
        total_calls_joined          = EXCLUDED.total_calls_joined,
        total_reports               = EXCLUDED.total_reports,
        last_active_date            = EXCLUDED.last_active_date,
        current_streak              = EXCLUDED.current_streak,
        last_report_date            = EXCLUDED.last_report_date,
        updated_at                  = now();

    END LOOP;

    -- Release advisory lock on success
    PERFORM pg_advisory_unlock(v_lock_key);

  EXCEPTION WHEN OTHERS THEN
    -- Release advisory lock on any error, then re-raise
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE;
  END;
END;
$$;


-- ============================================================================
-- Section 3: pg_cron job registration (D-06)
--
-- Idempotent: unschedule any existing job with this name before scheduling.
-- Schedule: 0 2 * * * = 2:00 AM UTC = 6:00 AM UAE (GST, UTC+4)
-- Runs after all students have submitted (11 PM UAE = 19:00 UTC deadline).
-- pg_cron is UTC-only — offset documented here and in table comment.
-- ============================================================================

-- Unschedule existing job if it exists (makes migration idempotent on re-run)
-- Wrapped in schema check so local Supabase (no pg_cron) doesn't fail
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('refresh-student-kpi-summaries');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Schedule nightly aggregation job
-- 0 2 * * * = 2:00 AM UTC = 6:00 AM UAE (GST, UTC+4)
-- Skipped when pg_cron is not available (e.g. local Docker)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule(
      'refresh-student-kpi-summaries',
      '0 2 * * *',
      'SELECT public.refresh_student_kpi_summaries()'
    );
  ELSE
    RAISE NOTICE 'pg_cron not available — skipping cron job registration (OK for local dev)';
  END IF;
END;
$$;


-- ============================================================================
-- Section 4: Update get_student_detail RPC (D-07)
--
-- Switch lifetime_outreach computation from full daily_reports SUM to a
-- single-row lookup from student_kpi_summaries.
--
-- Fallback: if no summary row exists yet (bootstrap hasn't run), fall back to
-- the original live query from daily_reports for correctness.
--
-- All other parts of get_student_detail are UNCHANGED.
-- get_owner_dashboard_stats is NOT updated (uses today-scoped reports_today).
-- get_sidebar_badges is NOT updated (complex alert logic, marginal benefit).
-- ============================================================================

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

  -- Lifetime outreach: read from summary table (D-07 switchover)
  -- Falls back to live daily_reports SUM if no summary row exists yet
  SELECT COALESCE(total_brands_contacted + total_influencers_contacted, 0)
  INTO v_lifetime_outreach
  FROM student_kpi_summaries
  WHERE student_id = p_student_id;

  -- Fallback: if no summary row exists (bootstrap hasn't run yet), use live query
  IF v_lifetime_outreach IS NULL THEN
    SELECT COALESCE(SUM(brands_contacted + influencers_contacted), 0)
    INTO v_lifetime_outreach
    FROM daily_reports
    WHERE student_id = p_student_id;
  END IF;

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
