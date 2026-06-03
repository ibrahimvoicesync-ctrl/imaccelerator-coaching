-- ============================================================================
-- Phase 64: Owner Analytics Expansion — Coach Leaderboards + Window Selectors
-- Migration: 00035_expand_owner_analytics_leaderboards.sql
--
-- Expands public.get_owner_analytics() from 3 lifetime leaderboards to 24
-- pre-computed slots (6 leaderboards x 4 windows) in one RPC call:
--
--   leaderboards.students.{hours, profit, deals}.{weekly, monthly, yearly, alltime}
--   leaderboards.coaches.{revenue, avg_total_outreach, deals}.{weekly, monthly, yearly, alltime}
--
-- Window semantics (WS-02 — trailing N days, NOT calendar periods; matches the
-- Phase 46 migration 00023:71 precedent):
--   weekly  = last 7 days   (created_at / completed_at / date >= NOW() - '7 days')
--   monthly = last 30 days
--   yearly  = last 365 days
--   alltime = no filter
--
-- Student leaderboards (3 metrics, 4 windows each = 12 slots):
--   hours   — SUM(work_sessions.duration_minutes) WHERE status='completed'
--   profit  — SUM(deals.profit)
--   deals   — COUNT(deals)
-- Student eligibility: role IN ('student','student_diy'); status filter NOT
-- applied (lifetime student leaderboards count historical work — preserves
-- Phase 54 semantics).
--
-- Coach leaderboards (3 metrics, 4 windows each = 12 slots):
--   revenue            — SUM(deals.profit) from deals owned by the coach's assigned active students
--   avg_total_outreach — see formula below
--   deals              — COUNT(deals) across assigned active students
-- Coach eligibility:
--   - users.role = 'coach' AND users.status = 'active'
--   - AND EXISTS (SELECT 1 FROM users s WHERE s.coach_id = c.id
--                 AND s.role IN ('student','student_diy') AND s.status='active')
-- Coaches with >=1 assigned active student but zero metric value appear with 0
-- (no HAVING > 0 filter on coach CTEs).
--
-- avg_total_outreach formula (per window):
--   SUM(COALESCE(brands_contacted,0) + COALESCE(influencers_contacted,0))
--     over reports in the window, from assigned active students
--   / (COUNT(DISTINCT assigned active students) * window_days)
-- window_days: weekly=7, monthly=30, yearly=365, alltime=GREATEST(1,
--              (CURRENT_DATE - MIN(dr.date))::int) across the coach's reports.
-- If student_count = 0, the coach's avg is 0 (no division).
--
-- Tiebreaker pattern (Phase 54): every ranked CTE uses
--   ORDER BY metric DESC, LOWER(name) ASC, id::text ASC
-- — 24 ranked CTEs total.
--
-- Authorization: identical to Phase 54 (migration 00028). auth.uid() IS NOT NULL
-- rejects authenticated callers; only the service-role admin client may invoke.
--
-- Cache: src/lib/rpc/owner-analytics.ts bumps the unstable_cache key from
-- ["owner-analytics"] to ["owner-analytics-v2"] in the SAME atomic commit so
-- stale V1 shapes are never served. Cache tag (`owner-analytics`) is unchanged
-- so existing revalidateTag invalidation in /api/deals, /api/deals/[id],
-- /api/work-sessions/[id], and (newly) /api/reports continues to work.
--
-- metric_display formatting (server-side so both surfaces agree):
--   hours:              "147.5 h"
--   profit / revenue:   "$12,450"  (thousands separator, no decimals)
--   deals:              "23"       (integer)
--   avg_total_outreach: "3.50"     (2 decimals, no unit)
-- ============================================================================

-- Idempotency: drop any existing overload to avoid PGRST203 on remote pushes
-- (pattern copied verbatim from 00028:47-59).
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_owner_analytics'
  LOOP
    EXECUTE format('DROP FUNCTION public.get_owner_analytics(%s) CASCADE', r.args);
  END LOOP;
END $drop$;

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
  -- 1. Authorization guard (Phase 54 pattern — service-role only).
  IF v_caller IS NOT NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- 2. Build all 24 slots in a single CTE chain. Per-entity-metric base CTEs
  --    compute all 4 windows at once via FILTER, then 4 ranked CTEs apply the
  --    tiebreaker ORDER BY metric DESC, LOWER(name) ASC, id::text ASC.

  WITH
  -- ==========================================================================
  -- STUDENT HOURS (4 windows)
  -- ==========================================================================
  student_hours_rows AS (
    SELECT
      u.id   AS student_id,
      u.name AS student_name,
      COALESCE(SUM(ws.duration_minutes) FILTER (WHERE ws.completed_at >= v_now - INTERVAL '7 days'),   0)::bigint AS minutes_weekly,
      COALESCE(SUM(ws.duration_minutes) FILTER (WHERE ws.completed_at >= v_now - INTERVAL '30 days'),  0)::bigint AS minutes_monthly,
      COALESCE(SUM(ws.duration_minutes) FILTER (WHERE ws.completed_at >= v_now - INTERVAL '365 days'), 0)::bigint AS minutes_yearly,
      COALESCE(SUM(ws.duration_minutes),                                                               0)::bigint AS minutes_alltime
    FROM users u
    LEFT JOIN work_sessions ws
      ON ws.student_id = u.id
     AND ws.status = 'completed'
    WHERE u.role IN ('student','student_diy')
    GROUP BY u.id, u.name
  ),
  student_hours_weekly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY minutes_weekly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank,
           student_id, student_name, minutes_weekly AS minutes
    FROM student_hours_rows WHERE minutes_weekly > 0
  ),
  student_hours_monthly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY minutes_monthly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank,
           student_id, student_name, minutes_monthly AS minutes
    FROM student_hours_rows WHERE minutes_monthly > 0
  ),
  student_hours_yearly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY minutes_yearly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank,
           student_id, student_name, minutes_yearly AS minutes
    FROM student_hours_rows WHERE minutes_yearly > 0
  ),
  student_hours_alltime AS (
    SELECT ROW_NUMBER() OVER (ORDER BY minutes_alltime DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank,
           student_id, student_name, minutes_alltime AS minutes
    FROM student_hours_rows WHERE minutes_alltime > 0
  ),

  -- ==========================================================================
  -- STUDENT PROFIT (4 windows)
  -- ==========================================================================
  student_profit_rows AS (
    SELECT
      u.id   AS student_id,
      u.name AS student_name,
      COALESCE(SUM(d.profit) FILTER (WHERE d.created_at >= v_now - INTERVAL '7 days'),   0)::numeric AS profit_weekly,
      COALESCE(SUM(d.profit) FILTER (WHERE d.created_at >= v_now - INTERVAL '30 days'),  0)::numeric AS profit_monthly,
      COALESCE(SUM(d.profit) FILTER (WHERE d.created_at >= v_now - INTERVAL '365 days'), 0)::numeric AS profit_yearly,
      COALESCE(SUM(d.profit),                                                            0)::numeric AS profit_alltime
    FROM users u
    LEFT JOIN deals d ON d.student_id = u.id
    WHERE u.role IN ('student','student_diy')
    GROUP BY u.id, u.name
  ),
  student_profit_weekly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY profit_weekly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank,
           student_id, student_name, profit_weekly AS profit
    FROM student_profit_rows WHERE profit_weekly > 0
  ),
  student_profit_monthly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY profit_monthly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank,
           student_id, student_name, profit_monthly AS profit
    FROM student_profit_rows WHERE profit_monthly > 0
  ),
  student_profit_yearly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY profit_yearly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank,
           student_id, student_name, profit_yearly AS profit
    FROM student_profit_rows WHERE profit_yearly > 0
  ),
  student_profit_alltime AS (
    SELECT ROW_NUMBER() OVER (ORDER BY profit_alltime DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank,
           student_id, student_name, profit_alltime AS profit
    FROM student_profit_rows WHERE profit_alltime > 0
  ),

  -- ==========================================================================
  -- STUDENT DEALS (4 windows)
  -- ==========================================================================
  student_deals_rows AS (
    SELECT
      u.id   AS student_id,
      u.name AS student_name,
      COUNT(d.id) FILTER (WHERE d.created_at >= v_now - INTERVAL '7 days')::int   AS deals_weekly,
      COUNT(d.id) FILTER (WHERE d.created_at >= v_now - INTERVAL '30 days')::int  AS deals_monthly,
      COUNT(d.id) FILTER (WHERE d.created_at >= v_now - INTERVAL '365 days')::int AS deals_yearly,
      COUNT(d.id)::int                                                            AS deals_alltime
    FROM users u
    LEFT JOIN deals d ON d.student_id = u.id
    WHERE u.role IN ('student','student_diy')
    GROUP BY u.id, u.name
  ),
  student_deals_weekly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY deals_weekly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank,
           student_id, student_name, deals_weekly AS deals
    FROM student_deals_rows WHERE deals_weekly > 0
  ),
  student_deals_monthly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY deals_monthly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank,
           student_id, student_name, deals_monthly AS deals
    FROM student_deals_rows WHERE deals_monthly > 0
  ),
  student_deals_yearly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY deals_yearly DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank,
           student_id, student_name, deals_yearly AS deals
    FROM student_deals_rows WHERE deals_yearly > 0
  ),
  student_deals_alltime AS (
    SELECT ROW_NUMBER() OVER (ORDER BY deals_alltime DESC, LOWER(student_name) ASC, student_id::text ASC)::int AS rank,
           student_id, student_name, deals_alltime AS deals
    FROM student_deals_rows WHERE deals_alltime > 0
  ),

  -- ==========================================================================
  -- ELIGIBLE COACHES (base CTE)
  -- ==========================================================================
  -- Coaches with role='coach', status='active', and >=1 assigned active student.
  eligible_coaches AS (
    SELECT c.id AS coach_id, c.name AS coach_name
    FROM users c
    WHERE c.role = 'coach'
      AND c.status = 'active'
      AND EXISTS (
        SELECT 1 FROM users s
        WHERE s.coach_id = c.id
          AND s.role IN ('student','student_diy')
          AND s.status = 'active'
      )
  ),

  -- ==========================================================================
  -- COACH REVENUE (4 windows) — SUM(deals.profit) from assigned active students
  -- ==========================================================================
  -- NOTE: NO HAVING > 0 — coaches with >=1 active student but zero deals still
  -- appear with 0 per the phase spec.
  coach_revenue_rows AS (
    SELECT
      ec.coach_id, ec.coach_name,
      COALESCE(SUM(d.profit) FILTER (WHERE d.created_at >= v_now - INTERVAL '7 days'),   0)::numeric AS profit_weekly,
      COALESCE(SUM(d.profit) FILTER (WHERE d.created_at >= v_now - INTERVAL '30 days'),  0)::numeric AS profit_monthly,
      COALESCE(SUM(d.profit) FILTER (WHERE d.created_at >= v_now - INTERVAL '365 days'), 0)::numeric AS profit_yearly,
      COALESCE(SUM(d.profit),                                                            0)::numeric AS profit_alltime
    FROM eligible_coaches ec
    LEFT JOIN users s
      ON s.coach_id = ec.coach_id
     AND s.role IN ('student','student_diy')
     AND s.status = 'active'
    LEFT JOIN deals d ON d.student_id = s.id
    GROUP BY ec.coach_id, ec.coach_name
  ),
  coach_revenue_weekly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY profit_weekly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank,
           coach_id, coach_name, profit_weekly AS profit
    FROM coach_revenue_rows
  ),
  coach_revenue_monthly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY profit_monthly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank,
           coach_id, coach_name, profit_monthly AS profit
    FROM coach_revenue_rows
  ),
  coach_revenue_yearly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY profit_yearly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank,
           coach_id, coach_name, profit_yearly AS profit
    FROM coach_revenue_rows
  ),
  coach_revenue_alltime AS (
    SELECT ROW_NUMBER() OVER (ORDER BY profit_alltime DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank,
           coach_id, coach_name, profit_alltime AS profit
    FROM coach_revenue_rows
  ),

  -- ==========================================================================
  -- COACH DEALS (4 windows) — COUNT(deals) from assigned active students
  -- ==========================================================================
  coach_deals_rows AS (
    SELECT
      ec.coach_id, ec.coach_name,
      COUNT(d.id) FILTER (WHERE d.created_at >= v_now - INTERVAL '7 days')::int   AS deals_weekly,
      COUNT(d.id) FILTER (WHERE d.created_at >= v_now - INTERVAL '30 days')::int  AS deals_monthly,
      COUNT(d.id) FILTER (WHERE d.created_at >= v_now - INTERVAL '365 days')::int AS deals_yearly,
      COUNT(d.id)::int                                                            AS deals_alltime
    FROM eligible_coaches ec
    LEFT JOIN users s
      ON s.coach_id = ec.coach_id
     AND s.role IN ('student','student_diy')
     AND s.status = 'active'
    LEFT JOIN deals d ON d.student_id = s.id
    GROUP BY ec.coach_id, ec.coach_name
  ),
  coach_deals_weekly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY deals_weekly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank,
           coach_id, coach_name, deals_weekly AS deals
    FROM coach_deals_rows
  ),
  coach_deals_monthly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY deals_monthly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank,
           coach_id, coach_name, deals_monthly AS deals
    FROM coach_deals_rows
  ),
  coach_deals_yearly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY deals_yearly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank,
           coach_id, coach_name, deals_yearly AS deals
    FROM coach_deals_rows
  ),
  coach_deals_alltime AS (
    SELECT ROW_NUMBER() OVER (ORDER BY deals_alltime DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank,
           coach_id, coach_name, deals_alltime AS deals
    FROM coach_deals_rows
  ),

  -- ==========================================================================
  -- COACH AVG TOTAL OUTREACH (4 windows)
  -- ==========================================================================
  -- Formula (per window):
  --   SUM(COALESCE(brands_contacted,0) + COALESCE(influencers_contacted,0)) in window
  --   / (COUNT(DISTINCT assigned active students) * window_days)
  -- window_days: weekly=7, monthly=30, yearly=365, alltime=GREATEST(1, (CURRENT_DATE - MIN(dr.date))::int)
  coach_outreach_rows AS (
    SELECT
      ec.coach_id, ec.coach_name,
      COALESCE(SUM(COALESCE(dr.brands_contacted,0) + COALESCE(dr.influencers_contacted,0))
        FILTER (WHERE dr.date >= (v_now - INTERVAL '7 days')::date), 0)::numeric   AS outreach_sum_weekly,
      COALESCE(SUM(COALESCE(dr.brands_contacted,0) + COALESCE(dr.influencers_contacted,0))
        FILTER (WHERE dr.date >= (v_now - INTERVAL '30 days')::date), 0)::numeric  AS outreach_sum_monthly,
      COALESCE(SUM(COALESCE(dr.brands_contacted,0) + COALESCE(dr.influencers_contacted,0))
        FILTER (WHERE dr.date >= (v_now - INTERVAL '365 days')::date), 0)::numeric AS outreach_sum_yearly,
      COALESCE(SUM(COALESCE(dr.brands_contacted,0) + COALESCE(dr.influencers_contacted,0)), 0)::numeric AS outreach_sum_alltime,
      COUNT(DISTINCT s.id)::numeric AS student_count,
      GREATEST(1, (CURRENT_DATE - MIN(dr.date))::int)::numeric AS alltime_days
    FROM eligible_coaches ec
    LEFT JOIN users s
      ON s.coach_id = ec.coach_id
     AND s.role IN ('student','student_diy')
     AND s.status = 'active'
    LEFT JOIN daily_reports dr ON dr.student_id = s.id
    GROUP BY ec.coach_id, ec.coach_name
  ),
  coach_outreach_avg AS (
    SELECT
      coach_id, coach_name,
      CASE WHEN student_count > 0 THEN outreach_sum_weekly  / (student_count * 7)                        ELSE 0 END AS avg_weekly,
      CASE WHEN student_count > 0 THEN outreach_sum_monthly / (student_count * 30)                       ELSE 0 END AS avg_monthly,
      CASE WHEN student_count > 0 THEN outreach_sum_yearly  / (student_count * 365)                      ELSE 0 END AS avg_yearly,
      CASE WHEN student_count > 0 THEN outreach_sum_alltime / (student_count * COALESCE(alltime_days,1)) ELSE 0 END AS avg_alltime
    FROM coach_outreach_rows
  ),
  coach_outreach_weekly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY avg_weekly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank,
           coach_id, coach_name, avg_weekly AS avg
    FROM coach_outreach_avg
  ),
  coach_outreach_monthly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY avg_monthly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank,
           coach_id, coach_name, avg_monthly AS avg
    FROM coach_outreach_avg
  ),
  coach_outreach_yearly AS (
    SELECT ROW_NUMBER() OVER (ORDER BY avg_yearly DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank,
           coach_id, coach_name, avg_yearly AS avg
    FROM coach_outreach_avg
  ),
  coach_outreach_alltime AS (
    SELECT ROW_NUMBER() OVER (ORDER BY avg_alltime DESC, LOWER(coach_name) ASC, coach_id::text ASC)::int AS rank,
           coach_id, coach_name, avg_alltime AS avg
    FROM coach_outreach_avg
  )

  -- ==========================================================================
  -- BUILD RETURN ENVELOPE (24 slots)
  -- ==========================================================================
  SELECT jsonb_build_object(
    'leaderboards', jsonb_build_object(
      'students', jsonb_build_object(
        'hours', jsonb_build_object(
          'weekly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'student_id', student_id, 'student_name', student_name,
              'minutes', minutes,
              'metric_display', to_char(ROUND((minutes::numeric / 60.0), 1), 'FM999G999G990D0') || ' h'
            ) ORDER BY rank)
            FROM student_hours_weekly WHERE rank <= 3
          ), '[]'::jsonb),
          'monthly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'student_id', student_id, 'student_name', student_name,
              'minutes', minutes,
              'metric_display', to_char(ROUND((minutes::numeric / 60.0), 1), 'FM999G999G990D0') || ' h'
            ) ORDER BY rank)
            FROM student_hours_monthly WHERE rank <= 3
          ), '[]'::jsonb),
          'yearly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'student_id', student_id, 'student_name', student_name,
              'minutes', minutes,
              'metric_display', to_char(ROUND((minutes::numeric / 60.0), 1), 'FM999G999G990D0') || ' h'
            ) ORDER BY rank)
            FROM student_hours_yearly WHERE rank <= 3
          ), '[]'::jsonb),
          'alltime', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'student_id', student_id, 'student_name', student_name,
              'minutes', minutes,
              'metric_display', to_char(ROUND((minutes::numeric / 60.0), 1), 'FM999G999G990D0') || ' h'
            ) ORDER BY rank)
            FROM student_hours_alltime WHERE rank <= 3
          ), '[]'::jsonb)
        ),
        'profit', jsonb_build_object(
          'weekly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'student_id', student_id, 'student_name', student_name,
              'profit', profit,
              'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')
            ) ORDER BY rank)
            FROM student_profit_weekly WHERE rank <= 3
          ), '[]'::jsonb),
          'monthly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'student_id', student_id, 'student_name', student_name,
              'profit', profit,
              'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')
            ) ORDER BY rank)
            FROM student_profit_monthly WHERE rank <= 3
          ), '[]'::jsonb),
          'yearly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'student_id', student_id, 'student_name', student_name,
              'profit', profit,
              'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')
            ) ORDER BY rank)
            FROM student_profit_yearly WHERE rank <= 3
          ), '[]'::jsonb),
          'alltime', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'student_id', student_id, 'student_name', student_name,
              'profit', profit,
              'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')
            ) ORDER BY rank)
            FROM student_profit_alltime WHERE rank <= 3
          ), '[]'::jsonb)
        ),
        'deals', jsonb_build_object(
          'weekly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'student_id', student_id, 'student_name', student_name,
              'deals', deals, 'metric_display', deals::text
            ) ORDER BY rank)
            FROM student_deals_weekly WHERE rank <= 3
          ), '[]'::jsonb),
          'monthly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'student_id', student_id, 'student_name', student_name,
              'deals', deals, 'metric_display', deals::text
            ) ORDER BY rank)
            FROM student_deals_monthly WHERE rank <= 3
          ), '[]'::jsonb),
          'yearly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'student_id', student_id, 'student_name', student_name,
              'deals', deals, 'metric_display', deals::text
            ) ORDER BY rank)
            FROM student_deals_yearly WHERE rank <= 3
          ), '[]'::jsonb),
          'alltime', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'student_id', student_id, 'student_name', student_name,
              'deals', deals, 'metric_display', deals::text
            ) ORDER BY rank)
            FROM student_deals_alltime WHERE rank <= 3
          ), '[]'::jsonb)
        )
      ),
      'coaches', jsonb_build_object(
        'revenue', jsonb_build_object(
          'weekly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'coach_id', coach_id, 'coach_name', coach_name,
              'profit', profit,
              'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')
            ) ORDER BY rank)
            FROM coach_revenue_weekly WHERE rank <= 3
          ), '[]'::jsonb),
          'monthly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'coach_id', coach_id, 'coach_name', coach_name,
              'profit', profit,
              'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')
            ) ORDER BY rank)
            FROM coach_revenue_monthly WHERE rank <= 3
          ), '[]'::jsonb),
          'yearly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'coach_id', coach_id, 'coach_name', coach_name,
              'profit', profit,
              'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')
            ) ORDER BY rank)
            FROM coach_revenue_yearly WHERE rank <= 3
          ), '[]'::jsonb),
          'alltime', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'coach_id', coach_id, 'coach_name', coach_name,
              'profit', profit,
              'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')
            ) ORDER BY rank)
            FROM coach_revenue_alltime WHERE rank <= 3
          ), '[]'::jsonb)
        ),
        'avg_total_outreach', jsonb_build_object(
          'weekly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'coach_id', coach_id, 'coach_name', coach_name,
              'avg', avg,
              'metric_display', to_char(ROUND(avg::numeric, 2), 'FM999G990D00')
            ) ORDER BY rank)
            FROM coach_outreach_weekly WHERE rank <= 3
          ), '[]'::jsonb),
          'monthly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'coach_id', coach_id, 'coach_name', coach_name,
              'avg', avg,
              'metric_display', to_char(ROUND(avg::numeric, 2), 'FM999G990D00')
            ) ORDER BY rank)
            FROM coach_outreach_monthly WHERE rank <= 3
          ), '[]'::jsonb),
          'yearly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'coach_id', coach_id, 'coach_name', coach_name,
              'avg', avg,
              'metric_display', to_char(ROUND(avg::numeric, 2), 'FM999G990D00')
            ) ORDER BY rank)
            FROM coach_outreach_yearly WHERE rank <= 3
          ), '[]'::jsonb),
          'alltime', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'coach_id', coach_id, 'coach_name', coach_name,
              'avg', avg,
              'metric_display', to_char(ROUND(avg::numeric, 2), 'FM999G990D00')
            ) ORDER BY rank)
            FROM coach_outreach_alltime WHERE rank <= 3
          ), '[]'::jsonb)
        ),
        'deals', jsonb_build_object(
          'weekly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'coach_id', coach_id, 'coach_name', coach_name,
              'deals', deals, 'metric_display', deals::text
            ) ORDER BY rank)
            FROM coach_deals_weekly WHERE rank <= 3
          ), '[]'::jsonb),
          'monthly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'coach_id', coach_id, 'coach_name', coach_name,
              'deals', deals, 'metric_display', deals::text
            ) ORDER BY rank)
            FROM coach_deals_monthly WHERE rank <= 3
          ), '[]'::jsonb),
          'yearly', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'coach_id', coach_id, 'coach_name', coach_name,
              'deals', deals, 'metric_display', deals::text
            ) ORDER BY rank)
            FROM coach_deals_yearly WHERE rank <= 3
          ), '[]'::jsonb),
          'alltime', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'rank', rank, 'coach_id', coach_id, 'coach_name', coach_name,
              'deals', deals, 'metric_display', deals::text
            ) ORDER BY rank)
            FROM coach_deals_alltime WHERE rank <= 3
          ), '[]'::jsonb)
        )
      )
    )
  )
  INTO v_envelope;

  RETURN v_envelope;
END;
$$;

-- Tighten execute grants: service_role only (admin client). Auth guard above
-- already rejects non-null auth.uid(); grant tightening is defense in depth.
REVOKE EXECUTE ON FUNCTION public.get_owner_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_owner_analytics() TO service_role;
