-- =============================================================================
-- Migration: 00049_lock_down_rpc_grants.sql
--
-- SECURITY FIX (critical) + defense-in-depth guard hardening.
--
-- ROOT CAUSE
-- ----------
-- The schema granted EXECUTE on EVERY routine to `anon` and `authenticated`:
--     GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
--     ALTER DEFAULT PRIVILEGES ... GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
-- The analytics/detail RPCs are SECURITY DEFINER (they bypass RLS) and guard
-- themselves only with `IF (SELECT auth.uid()) IS NOT NULL THEN RAISE`. For an
-- ANONYMOUS caller auth.uid() is NULL, so the guard never fires and the
-- function returns data. get_student_detail had NO guard at all. The later
-- `REVOKE EXECUTE ... FROM PUBLIC` lines were INEFFECTIVE — they revoke from
-- PUBLIC, not from the explicit anon/authenticated grants.
--
-- Net effect: anyone with the public anon key (shipped in the browser bundle)
-- could POST /rest/v1/rpc/<name> and read platform-wide financials,
-- name+profit leaderboards, and individual students' daily-report free-text.
-- refresh_student_kpi_summaries() (VOLATILE, no guard) was also anon-invokable
-- (DoS).
--
-- FIX (two layers)
-- ----------------
-- PRIMARY: strip EXECUTE on routines from anon/authenticated (the blanket grant
--   AND the already-granted privileges AND the default privileges), and grant
--   routines to service_role only. All app RPC callers use the service-role
--   admin client (src/lib/rpc/*.ts, src/app/(dashboard)/**). The RLS helper
--   functions get_user_id()/get_user_role() are re-granted to anon/authenticated
--   because RLS policy expressions call them as the querying role — revoking
--   them would break every policy (the whole app for logged-in users).
--
-- SECONDARY (defense-in-depth): harden the in-function guards so that even if a
--   future change re-grants anon EXECUTE, the sensitive SECURITY DEFINER
--   functions still refuse anonymous/authenticated callers.
--
-- Also mirrors two already-applied migrations into sql-import/schema.sql only
-- (00045 push_subscriptions, 00046 reminder_hour/offset) — NOT re-applied here
-- — and corrects the announcements write policies (they compared author_id to
-- auth.uid() instead of get_user_id(), so they never matched / failed closed).
--
-- Idempotent: GRANT/REVOKE and CREATE OR REPLACE are naturally repeatable;
-- announcements policies use DROP POLICY IF EXISTS + CREATE. Transactional.
--
-- APPLY AS the `postgres` superuser (per CLAUDE.md deploy notes), e.g.
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/migrations/00049_lock_down_rpc_grants.sql
-- ALTER DEFAULT PRIVILEGES below only rewrites defaults owned by the role that
-- runs this file, so it must be the same role that created the originals
-- (postgres). auth.role() is the standard self-hosted Supabase helper (same
-- source migration as auth.uid(), which the existing guards already use).
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1 — Defense-in-depth: harden in-function guards (CREATE OR REPLACE).
-- Bodies are unchanged except the caller guard. The strict guard requires the
-- service-role admin client; refresh_student_kpi_summaries() uses a blocklist
-- instead (its nightly pg_cron job runs as `postgres`, auth.role() IS NULL, so
-- a strict service_role check would break it).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- get_owner_dashboard_stats
-- ----------------------------------------------------------------------------
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
  -- Hardened (migration 00049): SECURITY DEFINER function returning
  -- platform-wide owner stats. Only the service-role admin client may run it.
  -- (Primary defense is the EXECUTE grant lockdown; this is defense-in-depth.)
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_students',     (SELECT count(*) FROM users WHERE role IN ('student','student_diy') AND status = 'active'),
    'total_coaches',      (SELECT count(*) FROM users WHERE role = 'coach' AND status = 'active'),
    'active_today_count', (SELECT count(DISTINCT student_id) FROM work_sessions WHERE date = v_today),
    'reports_today',      (SELECT count(*) FROM daily_reports WHERE date = v_today AND submitted_at IS NOT NULL)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- get_student_detail
-- ----------------------------------------------------------------------------
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
  -- Hardened (migration 00049): this SECURITY DEFINER function bypasses RLS and
  -- returns ANY student's full daily-report free-text, work sessions and
  -- roadmap for an arbitrary p_student_id. It previously had NO caller guard,
  -- so an anonymous PostgREST caller could read it. Only the service-role admin
  -- client may execute it. (Primary defense is the EXECUTE grant lockdown.)
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

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

  SELECT COALESCE(total_brands_contacted + total_influencers_contacted, 0)
  INTO v_lifetime_outreach
  FROM student_kpi_summaries
  WHERE student_id = p_student_id;

  IF v_lifetime_outreach IS NULL THEN
    SELECT COALESCE(SUM(brands_contacted + influencers_contacted), 0)
    INTO v_lifetime_outreach
    FROM daily_reports
    WHERE student_id = p_student_id;
  END IF;

  SELECT COALESCE(SUM(brands_contacted + influencers_contacted), 0)
  INTO v_today_outreach
  FROM daily_reports
  WHERE student_id = p_student_id
    AND date = v_today;

  SELECT COALESCE(SUM(duration_minutes), 0)
  INTO v_today_minutes
  FROM work_sessions
  WHERE student_id = p_student_id
    AND date = v_today
    AND status = 'completed';

  SELECT MAX(date)
  INTO v_latest_session_date
  FROM work_sessions
  WHERE student_id = p_student_id;

  SELECT MAX(date)
  INTO v_latest_report_date
  FROM daily_reports
  WHERE student_id = p_student_id;

  SELECT COALESCE(jsonb_agg(star_rating ORDER BY date DESC), '[]'::jsonb)
  INTO v_recent_ratings
  FROM daily_reports
  WHERE student_id = p_student_id
    AND date >= v_seven_days_ago
    AND star_rating IS NOT NULL;

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
      WHERE role IN ('student','student_diy')
        AND status = 'active'
        AND coach_id IS NOT NULL
      GROUP BY coach_id
    ) sub;
  END IF;

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

-- ----------------------------------------------------------------------------
-- refresh_student_kpi_summaries
-- ----------------------------------------------------------------------------
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
  -- Hardened (migration 00049): DoS guard. This VOLATILE function loops over
  -- every active student. Block the PostgREST-facing anon/authenticated roles.
  -- NOTE: we intentionally do NOT require service_role here — the nightly
  -- pg_cron job runs this as the `postgres` role (no JWT, so auth.role() IS
  -- NULL); a strict service_role check would break that job. The primary
  -- defense is the EXECUTE grant lockdown (anon/authenticated no longer hold
  -- EXECUTE at all); this blocklist is defense-in-depth.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT pg_try_advisory_lock(v_lock_key) THEN
    RAISE NOTICE 'refresh_student_kpi_summaries: already running, skipping';
    RETURN;
  END IF;

  BEGIN
    FOR v_student IN
      SELECT
        u.id                   AS student_id,
        s.last_report_date     AS existing_last_report
      FROM users u
      LEFT JOIN student_kpi_summaries s ON s.student_id = u.id
      WHERE u.role IN ('student','student_diy') AND u.status = 'active'
    LOOP
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

      v_last_report := v_last_active;

      v_streak := 0;

      IF v_last_active IS NOT NULL THEN
        IF v_last_active < CURRENT_DATE - 1 THEN
          v_streak := 0;
        ELSE
          v_check_date := v_last_active;
          LOOP
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
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;

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

    PERFORM pg_advisory_unlock(v_lock_key);

  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE;
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- get_owner_analytics
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_owner_analytics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   uuid := (SELECT auth.uid());
  v_now      timestamptz := NOW();
  v_envelope jsonb;
BEGIN
  -- Hardened (migration 00049): defense-in-depth. anon AND service_role BOTH
  -- have a NULL auth.uid(), so the old `v_caller IS NOT NULL` check let an
  -- anonymous caller through. Require the service-role admin client explicitly.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  WITH
  student_hours_rows AS (
    SELECT u.id AS student_id, u.name AS student_name,
      COALESCE(SUM(ws.duration_minutes) FILTER (WHERE ws.completed_at >= v_now - INTERVAL '7 days'),   0)::bigint AS minutes_weekly,
      COALESCE(SUM(ws.duration_minutes) FILTER (WHERE ws.completed_at >= v_now - INTERVAL '30 days'),  0)::bigint AS minutes_monthly,
      COALESCE(SUM(ws.duration_minutes) FILTER (WHERE ws.completed_at >= v_now - INTERVAL '365 days'), 0)::bigint AS minutes_yearly,
      COALESCE(SUM(ws.duration_minutes), 0)::bigint AS minutes_alltime
    FROM users u LEFT JOIN work_sessions ws ON ws.student_id = u.id AND ws.status = 'completed'
    WHERE u.role IN ('student','student_diy') GROUP BY u.id, u.name
  ),
  student_hours_weekly AS (SELECT ROW_NUMBER() OVER (ORDER BY minutes_weekly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank, student_id, student_name, minutes_weekly AS minutes FROM student_hours_rows WHERE minutes_weekly > 0),
  student_hours_monthly AS (SELECT ROW_NUMBER() OVER (ORDER BY minutes_monthly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank, student_id, student_name, minutes_monthly AS minutes FROM student_hours_rows WHERE minutes_monthly > 0),
  student_hours_yearly AS (SELECT ROW_NUMBER() OVER (ORDER BY minutes_yearly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank, student_id, student_name, minutes_yearly AS minutes FROM student_hours_rows WHERE minutes_yearly > 0),
  student_hours_alltime AS (SELECT ROW_NUMBER() OVER (ORDER BY minutes_alltime DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank, student_id, student_name, minutes_alltime AS minutes FROM student_hours_rows WHERE minutes_alltime > 0),
  student_profit_rows AS (
    SELECT u.id AS student_id, u.name AS student_name,
      COALESCE(SUM(d.profit) FILTER (WHERE d.created_at >= v_now - INTERVAL '7 days'),   0)::numeric AS profit_weekly,
      COALESCE(SUM(d.profit) FILTER (WHERE d.created_at >= v_now - INTERVAL '30 days'),  0)::numeric AS profit_monthly,
      COALESCE(SUM(d.profit) FILTER (WHERE d.created_at >= v_now - INTERVAL '365 days'), 0)::numeric AS profit_yearly,
      COALESCE(SUM(d.profit), 0)::numeric AS profit_alltime
    FROM users u LEFT JOIN deals d ON d.student_id = u.id
    WHERE u.role IN ('student','student_diy') GROUP BY u.id, u.name
  ),
  student_profit_weekly AS (SELECT ROW_NUMBER() OVER (ORDER BY profit_weekly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank, student_id, student_name, profit_weekly AS profit FROM student_profit_rows WHERE profit_weekly > 0),
  student_profit_monthly AS (SELECT ROW_NUMBER() OVER (ORDER BY profit_monthly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank, student_id, student_name, profit_monthly AS profit FROM student_profit_rows WHERE profit_monthly > 0),
  student_profit_yearly AS (SELECT ROW_NUMBER() OVER (ORDER BY profit_yearly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank, student_id, student_name, profit_yearly AS profit FROM student_profit_rows WHERE profit_yearly > 0),
  student_profit_alltime AS (SELECT ROW_NUMBER() OVER (ORDER BY profit_alltime DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank, student_id, student_name, profit_alltime AS profit FROM student_profit_rows WHERE profit_alltime > 0),
  student_deals_rows AS (
    SELECT u.id AS student_id, u.name AS student_name,
      COUNT(d.id) FILTER (WHERE d.created_at >= v_now - INTERVAL '7 days')::int AS deals_weekly,
      COUNT(d.id) FILTER (WHERE d.created_at >= v_now - INTERVAL '30 days')::int AS deals_monthly,
      COUNT(d.id) FILTER (WHERE d.created_at >= v_now - INTERVAL '365 days')::int AS deals_yearly,
      COUNT(d.id)::int AS deals_alltime
    FROM users u LEFT JOIN deals d ON d.student_id = u.id
    WHERE u.role IN ('student','student_diy') GROUP BY u.id, u.name
  ),
  student_deals_weekly AS (SELECT ROW_NUMBER() OVER (ORDER BY deals_weekly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank, student_id, student_name, deals_weekly AS deals FROM student_deals_rows WHERE deals_weekly > 0),
  student_deals_monthly AS (SELECT ROW_NUMBER() OVER (ORDER BY deals_monthly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank, student_id, student_name, deals_monthly AS deals FROM student_deals_rows WHERE deals_monthly > 0),
  student_deals_yearly AS (SELECT ROW_NUMBER() OVER (ORDER BY deals_yearly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank, student_id, student_name, deals_yearly AS deals FROM student_deals_rows WHERE deals_yearly > 0),
  student_deals_alltime AS (SELECT ROW_NUMBER() OVER (ORDER BY deals_alltime DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank, student_id, student_name, deals_alltime AS deals FROM student_deals_rows WHERE deals_alltime > 0),
  eligible_coaches AS (
    SELECT c.id AS coach_id, c.name AS coach_name FROM users c
    WHERE c.role = 'coach' AND c.status = 'active'
      AND EXISTS (SELECT 1 FROM users s WHERE s.coach_id = c.id AND s.role IN ('student','student_diy') AND s.status = 'active')
  ),
  coach_revenue_rows AS (
    SELECT ec.coach_id, ec.coach_name,
      COALESCE(SUM(d.profit) FILTER (WHERE d.created_at >= v_now - INTERVAL '7 days'),   0)::numeric AS profit_weekly,
      COALESCE(SUM(d.profit) FILTER (WHERE d.created_at >= v_now - INTERVAL '30 days'),  0)::numeric AS profit_monthly,
      COALESCE(SUM(d.profit) FILTER (WHERE d.created_at >= v_now - INTERVAL '365 days'), 0)::numeric AS profit_yearly,
      COALESCE(SUM(d.profit), 0)::numeric AS profit_alltime
    FROM eligible_coaches ec
    LEFT JOIN users s ON s.coach_id = ec.coach_id AND s.role IN ('student','student_diy') AND s.status = 'active'
    LEFT JOIN deals d ON d.student_id = s.id
    GROUP BY ec.coach_id, ec.coach_name
  ),
  coach_revenue_weekly AS (SELECT ROW_NUMBER() OVER (ORDER BY profit_weekly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank, coach_id, coach_name, profit_weekly AS profit FROM coach_revenue_rows),
  coach_revenue_monthly AS (SELECT ROW_NUMBER() OVER (ORDER BY profit_monthly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank, coach_id, coach_name, profit_monthly AS profit FROM coach_revenue_rows),
  coach_revenue_yearly AS (SELECT ROW_NUMBER() OVER (ORDER BY profit_yearly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank, coach_id, coach_name, profit_yearly AS profit FROM coach_revenue_rows),
  coach_revenue_alltime AS (SELECT ROW_NUMBER() OVER (ORDER BY profit_alltime DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank, coach_id, coach_name, profit_alltime AS profit FROM coach_revenue_rows),
  coach_deals_rows AS (
    SELECT ec.coach_id, ec.coach_name,
      COUNT(d.id) FILTER (WHERE d.created_at >= v_now - INTERVAL '7 days')::int AS deals_weekly,
      COUNT(d.id) FILTER (WHERE d.created_at >= v_now - INTERVAL '30 days')::int AS deals_monthly,
      COUNT(d.id) FILTER (WHERE d.created_at >= v_now - INTERVAL '365 days')::int AS deals_yearly,
      COUNT(d.id)::int AS deals_alltime
    FROM eligible_coaches ec
    LEFT JOIN users s ON s.coach_id = ec.coach_id AND s.role IN ('student','student_diy') AND s.status = 'active'
    LEFT JOIN deals d ON d.student_id = s.id
    GROUP BY ec.coach_id, ec.coach_name
  ),
  coach_deals_weekly AS (SELECT ROW_NUMBER() OVER (ORDER BY deals_weekly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank, coach_id, coach_name, deals_weekly AS deals FROM coach_deals_rows),
  coach_deals_monthly AS (SELECT ROW_NUMBER() OVER (ORDER BY deals_monthly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank, coach_id, coach_name, deals_monthly AS deals FROM coach_deals_rows),
  coach_deals_yearly AS (SELECT ROW_NUMBER() OVER (ORDER BY deals_yearly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank, coach_id, coach_name, deals_yearly AS deals FROM coach_deals_rows),
  coach_deals_alltime AS (SELECT ROW_NUMBER() OVER (ORDER BY deals_alltime DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank, coach_id, coach_name, deals_alltime AS deals FROM coach_deals_rows),
  coach_outreach_rows AS (
    SELECT ec.coach_id, ec.coach_name,
      COALESCE(SUM(COALESCE(dr.brands_contacted,0) + COALESCE(dr.influencers_contacted,0)) FILTER (WHERE dr.date >= (v_now - INTERVAL '7 days')::date), 0)::numeric AS outreach_sum_weekly,
      COALESCE(SUM(COALESCE(dr.brands_contacted,0) + COALESCE(dr.influencers_contacted,0)) FILTER (WHERE dr.date >= (v_now - INTERVAL '30 days')::date), 0)::numeric AS outreach_sum_monthly,
      COALESCE(SUM(COALESCE(dr.brands_contacted,0) + COALESCE(dr.influencers_contacted,0)) FILTER (WHERE dr.date >= (v_now - INTERVAL '365 days')::date), 0)::numeric AS outreach_sum_yearly,
      COALESCE(SUM(COALESCE(dr.brands_contacted,0) + COALESCE(dr.influencers_contacted,0)), 0)::numeric AS outreach_sum_alltime,
      COUNT(DISTINCT s.id)::numeric AS student_count,
      GREATEST(1, (CURRENT_DATE - MIN(dr.date))::int)::numeric AS alltime_days
    FROM eligible_coaches ec
    LEFT JOIN users s ON s.coach_id = ec.coach_id AND s.role IN ('student','student_diy') AND s.status = 'active'
    LEFT JOIN daily_reports dr ON dr.student_id = s.id
    GROUP BY ec.coach_id, ec.coach_name
  ),
  coach_outreach_avg AS (
    SELECT coach_id, coach_name,
      CASE WHEN student_count > 0 THEN outreach_sum_weekly  / (student_count * 7) ELSE 0 END AS avg_weekly,
      CASE WHEN student_count > 0 THEN outreach_sum_monthly / (student_count * 30) ELSE 0 END AS avg_monthly,
      CASE WHEN student_count > 0 THEN outreach_sum_yearly  / (student_count * 365) ELSE 0 END AS avg_yearly,
      CASE WHEN student_count > 0 THEN outreach_sum_alltime / (student_count * COALESCE(alltime_days,1)) ELSE 0 END AS avg_alltime
    FROM coach_outreach_rows
  ),
  coach_outreach_weekly AS (SELECT ROW_NUMBER() OVER (ORDER BY avg_weekly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank, coach_id, coach_name, avg_weekly AS avg FROM coach_outreach_avg),
  coach_outreach_monthly AS (SELECT ROW_NUMBER() OVER (ORDER BY avg_monthly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank, coach_id, coach_name, avg_monthly AS avg FROM coach_outreach_avg),
  coach_outreach_yearly AS (SELECT ROW_NUMBER() OVER (ORDER BY avg_yearly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank, coach_id, coach_name, avg_yearly AS avg FROM coach_outreach_avg),
  coach_outreach_alltime AS (SELECT ROW_NUMBER() OVER (ORDER BY avg_alltime DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank, coach_id, coach_name, avg_alltime AS avg FROM coach_outreach_avg)
  SELECT jsonb_build_object('leaderboards', jsonb_build_object(
    'students', jsonb_build_object(
      'hours', jsonb_build_object(
        'weekly',  COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'student_id', student_id, 'student_name', student_name, 'minutes', minutes, 'metric_display', to_char(ROUND((minutes::numeric / 60.0), 1), 'FM999G999G990D0') || ' h') ORDER BY rank) FROM student_hours_weekly WHERE rank <= 3), '[]'::jsonb),
        'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'student_id', student_id, 'student_name', student_name, 'minutes', minutes, 'metric_display', to_char(ROUND((minutes::numeric / 60.0), 1), 'FM999G999G990D0') || ' h') ORDER BY rank) FROM student_hours_monthly WHERE rank <= 3), '[]'::jsonb),
        'yearly',  COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'student_id', student_id, 'student_name', student_name, 'minutes', minutes, 'metric_display', to_char(ROUND((minutes::numeric / 60.0), 1), 'FM999G999G990D0') || ' h') ORDER BY rank) FROM student_hours_yearly WHERE rank <= 3), '[]'::jsonb),
        'alltime', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'student_id', student_id, 'student_name', student_name, 'minutes', minutes, 'metric_display', to_char(ROUND((minutes::numeric / 60.0), 1), 'FM999G999G990D0') || ' h') ORDER BY rank) FROM student_hours_alltime WHERE rank <= 3), '[]'::jsonb)
      ),
      'profit', jsonb_build_object(
        'weekly',  COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'student_id', student_id, 'student_name', student_name, 'profit', profit, 'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')) ORDER BY rank) FROM student_profit_weekly WHERE rank <= 3), '[]'::jsonb),
        'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'student_id', student_id, 'student_name', student_name, 'profit', profit, 'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')) ORDER BY rank) FROM student_profit_monthly WHERE rank <= 3), '[]'::jsonb),
        'yearly',  COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'student_id', student_id, 'student_name', student_name, 'profit', profit, 'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')) ORDER BY rank) FROM student_profit_yearly WHERE rank <= 3), '[]'::jsonb),
        'alltime', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'student_id', student_id, 'student_name', student_name, 'profit', profit, 'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')) ORDER BY rank) FROM student_profit_alltime WHERE rank <= 3), '[]'::jsonb)
      ),
      'deals', jsonb_build_object(
        'weekly',  COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'student_id', student_id, 'student_name', student_name, 'deals', deals, 'metric_display', deals::text) ORDER BY rank) FROM student_deals_weekly WHERE rank <= 3), '[]'::jsonb),
        'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'student_id', student_id, 'student_name', student_name, 'deals', deals, 'metric_display', deals::text) ORDER BY rank) FROM student_deals_monthly WHERE rank <= 3), '[]'::jsonb),
        'yearly',  COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'student_id', student_id, 'student_name', student_name, 'deals', deals, 'metric_display', deals::text) ORDER BY rank) FROM student_deals_yearly WHERE rank <= 3), '[]'::jsonb),
        'alltime', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'student_id', student_id, 'student_name', student_name, 'deals', deals, 'metric_display', deals::text) ORDER BY rank) FROM student_deals_alltime WHERE rank <= 3), '[]'::jsonb)
      )
    ),
    'coaches', jsonb_build_object(
      'revenue', jsonb_build_object(
        'weekly',  COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'coach_id', coach_id, 'coach_name', coach_name, 'profit', profit, 'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')) ORDER BY rank) FROM coach_revenue_weekly WHERE rank <= 3), '[]'::jsonb),
        'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'coach_id', coach_id, 'coach_name', coach_name, 'profit', profit, 'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')) ORDER BY rank) FROM coach_revenue_monthly WHERE rank <= 3), '[]'::jsonb),
        'yearly',  COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'coach_id', coach_id, 'coach_name', coach_name, 'profit', profit, 'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')) ORDER BY rank) FROM coach_revenue_yearly WHERE rank <= 3), '[]'::jsonb),
        'alltime', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'coach_id', coach_id, 'coach_name', coach_name, 'profit', profit, 'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')) ORDER BY rank) FROM coach_revenue_alltime WHERE rank <= 3), '[]'::jsonb)
      ),
      'avg_total_outreach', jsonb_build_object(
        'weekly',  COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'coach_id', coach_id, 'coach_name', coach_name, 'avg', avg, 'metric_display', to_char(ROUND(avg::numeric, 2), 'FM999G990D00')) ORDER BY rank) FROM coach_outreach_weekly WHERE rank <= 3), '[]'::jsonb),
        'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'coach_id', coach_id, 'coach_name', coach_name, 'avg', avg, 'metric_display', to_char(ROUND(avg::numeric, 2), 'FM999G990D00')) ORDER BY rank) FROM coach_outreach_monthly WHERE rank <= 3), '[]'::jsonb),
        'yearly',  COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'coach_id', coach_id, 'coach_name', coach_name, 'avg', avg, 'metric_display', to_char(ROUND(avg::numeric, 2), 'FM999G990D00')) ORDER BY rank) FROM coach_outreach_yearly WHERE rank <= 3), '[]'::jsonb),
        'alltime', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'coach_id', coach_id, 'coach_name', coach_name, 'avg', avg, 'metric_display', to_char(ROUND(avg::numeric, 2), 'FM999G990D00')) ORDER BY rank) FROM coach_outreach_alltime WHERE rank <= 3), '[]'::jsonb)
      ),
      'deals', jsonb_build_object(
        'weekly',  COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'coach_id', coach_id, 'coach_name', coach_name, 'deals', deals, 'metric_display', deals::text) ORDER BY rank) FROM coach_deals_weekly WHERE rank <= 3), '[]'::jsonb),
        'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'coach_id', coach_id, 'coach_name', coach_name, 'deals', deals, 'metric_display', deals::text) ORDER BY rank) FROM coach_deals_monthly WHERE rank <= 3), '[]'::jsonb),
        'yearly',  COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'coach_id', coach_id, 'coach_name', coach_name, 'deals', deals, 'metric_display', deals::text) ORDER BY rank) FROM coach_deals_yearly WHERE rank <= 3), '[]'::jsonb),
        'alltime', COALESCE((SELECT jsonb_agg(jsonb_build_object('rank', rank, 'coach_id', coach_id, 'coach_name', coach_name, 'deals', deals, 'metric_display', deals::text) ORDER BY rank) FROM coach_deals_alltime WHERE rank <= 3), '[]'::jsonb)
      )
    )
  ))
  INTO v_envelope;

  RETURN v_envelope;
END;
$$;

-- ----------------------------------------------------------------------------
-- get_platform_stats
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
BEGIN
  -- Hardened (migration 00049): defense-in-depth. anon AND service_role BOTH
  -- have a NULL auth.uid(), so the old `v_caller IS NOT NULL` check let an
  -- anonymous caller through. Require the service-role admin client explicitly.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'total_students',      (SELECT count(*) FROM users WHERE role IN ('student','student_diy') AND status = 'active'),
    'total_coaches',       (SELECT count(*) FROM users WHERE role = 'coach' AND status = 'active'),
    'total_deals',         (SELECT count(*) FROM deals),
    'total_revenue',       COALESCE((SELECT SUM(revenue) FROM deals), 0),
    'total_profit',        COALESCE((SELECT SUM(profit) FROM deals), 0),
    'total_hours_worked',  COALESCE((SELECT SUM(duration_minutes)::numeric / 60.0 FROM work_sessions WHERE status = 'completed'), 0),
    'total_reports',       (SELECT count(*) FROM daily_reports WHERE submitted_at IS NOT NULL)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- get_leaderboard
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_period_start date,
  p_top_n        int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_hours  jsonb;
  v_deals  jsonb;
  v_outreach jsonb;
BEGIN
  -- Hardened (migration 00049): defense-in-depth. anon AND service_role BOTH
  -- have a NULL auth.uid(), so the old `v_caller IS NOT NULL` check let an
  -- anonymous caller through. Require the service-role admin client explicitly.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'student_id', student_id, 'student_name', student_name, 'minutes', minutes
  ) ORDER BY minutes DESC), '[]'::jsonb)
  INTO v_hours
  FROM (
    SELECT u.id AS student_id, u.name AS student_name,
      COALESCE(SUM(ws.duration_minutes), 0)::int AS minutes
    FROM users u
    LEFT JOIN work_sessions ws ON ws.student_id = u.id AND ws.status = 'completed' AND ws.date >= p_period_start
    WHERE u.role IN ('student','student_diy') AND u.status = 'active'
    GROUP BY u.id, u.name
    HAVING COALESCE(SUM(ws.duration_minutes), 0) > 0
    ORDER BY minutes DESC
    LIMIT p_top_n
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'student_id', student_id, 'student_name', student_name, 'deals', deals
  ) ORDER BY deals DESC), '[]'::jsonb)
  INTO v_deals
  FROM (
    SELECT u.id AS student_id, u.name AS student_name,
      COUNT(d.id)::int AS deals
    FROM users u
    LEFT JOIN deals d ON d.student_id = u.id AND d.created_at >= p_period_start
    WHERE u.role IN ('student','student_diy') AND u.status = 'active'
    GROUP BY u.id, u.name
    HAVING COUNT(d.id) > 0
    ORDER BY deals DESC
    LIMIT p_top_n
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'student_id', student_id, 'student_name', student_name, 'outreach', outreach
  ) ORDER BY outreach DESC), '[]'::jsonb)
  INTO v_outreach
  FROM (
    SELECT u.id AS student_id, u.name AS student_name,
      COALESCE(SUM(COALESCE(dr.brands_contacted,0) + COALESCE(dr.influencers_contacted,0)), 0)::int AS outreach
    FROM users u
    LEFT JOIN daily_reports dr ON dr.student_id = u.id AND dr.submitted_at IS NOT NULL AND dr.date >= p_period_start
    WHERE u.role IN ('student','student_diy') AND u.status = 'active'
    GROUP BY u.id, u.name
    HAVING COALESCE(SUM(COALESCE(dr.brands_contacted,0) + COALESCE(dr.influencers_contacted,0)), 0) > 0
    ORDER BY outreach DESC
    LIMIT p_top_n
  ) s;

  RETURN jsonb_build_object('hours', v_hours, 'deals', v_deals, 'outreach', v_outreach);
END;
$$;

-- ----------------------------------------------------------------------------
-- get_tier_distribution
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tier_distribution()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
BEGIN
  -- Hardened (migration 00049): defense-in-depth. anon AND service_role BOTH
  -- have a NULL auth.uid(), so the old `v_caller IS NOT NULL` check let an
  -- anonymous caller through. Require the service-role admin client explicitly.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'role', role,
      'status', status,
      'count', cnt
    )), '[]'::jsonb)
    FROM (
      SELECT role, status, COUNT(*)::int AS cnt
      FROM users
      WHERE role IN ('student','student_diy','coach')
      GROUP BY role, status
      ORDER BY role, status
    ) s
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- get_coach_performance_summary
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_performance_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
BEGIN
  -- Hardened (migration 00049): defense-in-depth. anon AND service_role BOTH
  -- have a NULL auth.uid(), so the old `v_caller IS NOT NULL` check let an
  -- anonymous caller through. Require the service-role admin client explicitly.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'coach_id',      c.id,
      'coach_name',    c.name,
      'student_count', COALESCE(sc.cnt, 0),
      'total_revenue', COALESCE(rev.total, 0),
      'total_deals',   COALESCE(dc.cnt, 0),
      'avg_rating',    COALESCE(ar.avg_star, 0)
    ) ORDER BY c.name), '[]'::jsonb)
    FROM users c
    LEFT JOIN (
      SELECT coach_id, COUNT(*)::int AS cnt FROM users
      WHERE role IN ('student','student_diy') AND status = 'active' AND coach_id IS NOT NULL
      GROUP BY coach_id
    ) sc ON sc.coach_id = c.id
    LEFT JOIN (
      SELECT u.coach_id, SUM(d.revenue)::numeric AS total
      FROM deals d JOIN users u ON u.id = d.student_id
      WHERE u.coach_id IS NOT NULL
      GROUP BY u.coach_id
    ) rev ON rev.coach_id = c.id
    LEFT JOIN (
      SELECT u.coach_id, COUNT(*)::int AS cnt
      FROM deals d JOIN users u ON u.id = d.student_id
      WHERE u.coach_id IS NOT NULL
      GROUP BY u.coach_id
    ) dc ON dc.coach_id = c.id
    LEFT JOIN (
      SELECT s.coach_id, ROUND(AVG(dr.star_rating)::numeric, 2) AS avg_star
      FROM daily_reports dr JOIN users s ON s.id = dr.student_id
      WHERE s.coach_id IS NOT NULL AND dr.star_rating IS NOT NULL AND dr.submitted_at IS NOT NULL
      GROUP BY s.coach_id
    ) ar ON ar.coach_id = c.id
    WHERE c.role = 'coach' AND c.status = 'active'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- get_owner_platform_metrics
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_owner_platform_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   uuid := (SELECT auth.uid());
  v_now      timestamptz := NOW();
  v_envelope jsonb;
BEGIN
  -- Hardened (migration 00049): defense-in-depth. anon AND service_role BOTH
  -- have a NULL auth.uid(), so the old `v_caller IS NOT NULL` check let an
  -- anonymous caller through. Require the service-role admin client explicitly.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  WITH hours AS (
    SELECT
      COALESCE(SUM(dr.hours_worked) FILTER (WHERE dr.date >= (v_now - INTERVAL '7 days')::date),  0)::numeric  AS weekly,
      COALESCE(SUM(dr.hours_worked) FILTER (WHERE dr.date >= (v_now - INTERVAL '30 days')::date), 0)::numeric  AS monthly,
      COALESCE(SUM(dr.hours_worked) FILTER (WHERE dr.date >= (v_now - INTERVAL '90 days')::date), 0)::numeric  AS ninety,
      COALESCE(SUM(dr.hours_worked),                                                              0)::numeric  AS alltime
    FROM daily_reports dr
    JOIN users u ON u.id = dr.student_id AND u.role IN ('student','student_diy')
  ),
  per_student AS (
    SELECT rp.student_id,
           MAX(rp.step_number) FILTER (WHERE rp.status IN ('active','completed')) AS max_step
    FROM roadmap_progress rp
    JOIN users u ON u.id = rp.student_id AND u.role IN ('student','student_diy')
    GROUP BY rp.student_id
  ),
  roadmap AS (
    SELECT s.step_number,
           COUNT(ps.student_id) FILTER (WHERE ps.max_step >= s.step_number) AS students_reached
    FROM generate_series(1, 16) AS s(step_number)
    LEFT JOIN per_student ps ON TRUE
    GROUP BY s.step_number
    ORDER BY s.step_number
  )
  SELECT jsonb_build_object(
    'total_students', (SELECT count(*) FROM users WHERE role IN ('student','student_diy')),
    'hours', jsonb_build_object(
      'weekly',  ROUND((SELECT weekly  FROM hours), 1),
      'monthly', ROUND((SELECT monthly FROM hours), 1),
      'ninety',  ROUND((SELECT ninety  FROM hours), 1),
      'alltime', ROUND((SELECT alltime FROM hours), 1)
    ),
    'roadmap', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'step_number', step_number,
        'students_reached', students_reached
      ) ORDER BY step_number), '[]'::jsonb)
      FROM roadmap
    )
  ) INTO v_envelope;

  RETURN v_envelope;
END;
$$;


-- =============================================================================
-- PART 2 — Grant lockdown (PRIMARY defense).
-- =============================================================================

-- Routines to service_role ONLY. (Re-assert the blanket grant, then strip the
-- already-granted anon/authenticated EXECUTE, then fix the default privileges.)
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT  EXECUTE ON ROUTINES TO   service_role;

-- Table & sequence grants are intentionally NOT touched: RLS is the access
-- layer for table data, and revoking here risks over-reaching. (Left as-is.)

-- RLS helper functions MUST stay executable by anon/authenticated — RLS policy
-- expressions call them and are evaluated as the querying role. They leak
-- nothing (they only resolve the CALLER's own id/role via auth.uid()).
GRANT EXECUTE ON FUNCTION public.get_user_id()   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon, authenticated, service_role;

-- week_start is a pure IMMUTABLE date helper (no data): safe for authenticated.
GRANT EXECUTE ON FUNCTION public.week_start(date) TO authenticated, service_role;

-- Explicit least-privilege re-grants (service_role only) on every sensitive
-- RPC. Belt-and-suspenders with the blanket service_role grant above; also
-- documents the intended reachability. All callers use the admin client.
GRANT EXECUTE ON FUNCTION public.student_activity_status(uuid, date)                                     TO service_role;
GRANT EXECUTE ON FUNCTION public.get_student_analytics(uuid, text, int, int)                             TO service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_analytics(uuid, int, date, int, int, int, text, text)         TO service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_dashboard(uuid, date, date)                                   TO service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_milestones(uuid, date, boolean)                               TO service_role;
GRANT EXECUTE ON FUNCTION public.get_student_summary(uuid, date)                                         TO service_role;
GRANT EXECUTE ON FUNCTION public.get_student_detail(uuid, date, date, boolean)                           TO service_role;
GRANT EXECUTE ON FUNCTION public.get_weekly_skip_counts(uuid[], date, integer)                           TO service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_dashboard_stats()                                             TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sidebar_badges(uuid, text)                                          TO service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_analytics()                                                   TO service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_platform_metrics()                                            TO service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_stats()                                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(date, int)                                              TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tier_distribution()                                                 TO service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_performance_summary()                                         TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_student_kpi_summaries()                                         TO service_role;

-- =============================================================================
-- PART 3 — Correct the announcements write policies (defense-in-depth).
-- They compared author_id (= users.id = get_user_id()) to auth.uid()
-- (= users.auth_id), so they never matched and failed closed. Rewritten to the
-- get_user_id()/get_user_role() helper pattern used by every other table.
-- (Writes still normally go through the service-role admin client.)
-- =============================================================================

DROP POLICY IF EXISTS "announcements_insert_owner_coach" ON public.announcements;
CREATE POLICY "announcements_insert_owner_coach" ON public.announcements
  FOR INSERT
  WITH CHECK (
    author_id = (SELECT get_user_id())
    AND (SELECT get_user_role()) IN ('owner', 'coach')
  );

DROP POLICY IF EXISTS "announcements_update_own" ON public.announcements;
CREATE POLICY "announcements_update_own" ON public.announcements
  FOR UPDATE
  USING (
    author_id = (SELECT get_user_id())
    AND (SELECT get_user_role()) IN ('owner', 'coach')
  )
  WITH CHECK (
    author_id = (SELECT get_user_id())
  );

DROP POLICY IF EXISTS "announcements_delete_own" ON public.announcements;
CREATE POLICY "announcements_delete_own" ON public.announcements
  FOR DELETE
  USING (
    author_id = (SELECT get_user_id())
    AND (SELECT get_user_role()) IN ('owner', 'coach')
  );

COMMIT;
