-- ============================================================================
-- Phase 66 (v1.9): Student analytics date filter reshape — daily/weekly/monthly.
-- Migration: 00037_student_analytics_daily_weekly_monthly.sql
--
-- Replaces the 7d/30d/90d/all range selector with daily/weekly/monthly. Each
-- mode now owns its own window AND bucket:
--   daily   → last 12 days,    bucket = ws.date
--   weekly  → last 12 weeks,   bucket = public.week_start(ws.date)
--   monthly → last 12 months,  bucket = date_trunc('month', ws.date)::date
--
-- Breaking jsonb shape change: outreach_trend emits { bucket, brands,
-- influencers } instead of { week_start, brands, influencers }. Outreach
-- bucketing now follows the selected range instead of always-weekly.
--
-- Consumers in the same commit series:
--   - STUDENT_ANALYTICS_RANGES + StudentAnalyticsRange type
--   - student/analytics + student_diy/analytics server components (default
--     flips to 'daily', cache key bumps v3 → v4)
--   - AnalyticsClient.tsx RangeSelector + formatBucketTick + data table copy
--
-- Supersedes 00033. Signature (uuid, text, int, int) RETURNS jsonb unchanged.
-- PGRST203 playbook from 00033: defensive drop every overload before CREATE.
-- ============================================================================

BEGIN;

-- 1. Defensive drop every existing overload of get_student_analytics.
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_student_analytics'
  LOOP
    EXECUTE format('DROP FUNCTION public.get_student_analytics(%s) CASCADE', r.args);
  END LOOP;
END $drop$;

-- 2. Recreate with daily/weekly/monthly range handling.
CREATE OR REPLACE FUNCTION public.get_student_analytics(
  p_student_id uuid,
  p_range      text DEFAULT 'daily',
  p_page       int  DEFAULT 1,
  p_page_size  int  DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller           uuid := (SELECT auth.uid());
  v_start_date       date;
  v_today            date := CURRENT_DATE;
  v_bucket_mode      text;            -- 'day' | 'week' | 'month'
  v_totals           jsonb;
  v_streak           int := 0;
  v_outreach_trend   jsonb;
  v_hours_trend      jsonb;
  v_deals            jsonb;
  v_deal_summary     jsonb;
  v_roadmap          jsonb;
  v_total_deal_count int;
  v_offset           int;
BEGIN
  -- 1. Authorization guard — students can only read their own analytics.
  --    service_role callers (admin client) set auth.uid() to NULL; allow in that case
  --    because the Next.js route handler has already verified session.user.id matches.
  IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM p_student_id THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate range.
  IF p_range NOT IN ('daily','weekly','monthly') THEN
    RAISE EXCEPTION 'invalid_range: %', p_range USING ERRCODE = '22023';
  END IF;

  -- 3. Compute window start + bucketing strategy.
  IF p_range = 'daily' THEN
    v_start_date  := v_today - 11;                       -- 12 days inclusive
    v_bucket_mode := 'day';
  ELSIF p_range = 'weekly' THEN
    v_start_date  := v_today - 83;                       -- 12 weeks inclusive
    v_bucket_mode := 'week';
  ELSE -- 'monthly'
    v_start_date  := (date_trunc('month', v_today) - interval '11 months')::date;
    v_bucket_mode := 'month';
  END IF;

  -- 4. Page guards.
  IF p_page < 1 THEN p_page := 1; END IF;
  IF p_page_size < 1 THEN p_page_size := 25; END IF;
  IF p_page_size > 100 THEN p_page_size := 100; END IF;
  v_offset := (p_page - 1) * p_page_size;

  -- 5. Lifetime totals (unchanged — KPIs + hero are lifetime, not range-scoped).
  SELECT jsonb_build_object(
    'total_hours',
      COALESCE((
        SELECT SUM(duration_minutes)::numeric / 60.0
        FROM work_sessions
        WHERE student_id = p_student_id AND status = 'completed'
      ), 0),
    'total_brand_outreach',
      COALESCE((
        SELECT SUM(COALESCE(brands_contacted,0))
        FROM daily_reports
        WHERE student_id = p_student_id AND submitted_at IS NOT NULL
      ), 0),
    'total_influencer_outreach',
      COALESCE((
        SELECT SUM(COALESCE(influencers_contacted,0))
        FROM daily_reports
        WHERE student_id = p_student_id AND submitted_at IS NOT NULL
      ), 0),
    'total_deals',
      (SELECT COUNT(*) FROM deals WHERE student_id = p_student_id),
    'total_revenue',
      COALESCE((SELECT SUM(revenue) FROM deals WHERE student_id = p_student_id), 0),
    'total_profit',
      COALESCE((SELECT SUM(profit) FROM deals WHERE student_id = p_student_id), 0)
  ) INTO v_totals;

  -- 6. Current-day streak — unchanged.
  WITH recent AS (
    SELECT DISTINCT date
    FROM daily_reports
    WHERE student_id = p_student_id
      AND submitted_at IS NOT NULL
      AND date <= v_today
      AND date >= v_today - 365
    ORDER BY date DESC
  ),
  run AS (
    SELECT date,
           ROW_NUMBER() OVER (ORDER BY date DESC) AS rn,
           date + (ROW_NUMBER() OVER (ORDER BY date DESC))::int AS grp
    FROM recent
  )
  SELECT COUNT(*)::int INTO v_streak
  FROM run
  WHERE grp = (SELECT grp FROM run LIMIT 1)
    AND (SELECT MAX(date) FROM recent) = v_today;

  IF v_streak IS NULL THEN v_streak := 0; END IF;

  -- 7. Outreach trend — bucketing follows the selected range (v1.9 change).
  --    Emits { bucket, brands, influencers } (was { week_start, ... } pre-v1.9).
  IF v_bucket_mode = 'day' THEN
    SELECT COALESCE(jsonb_agg(row ORDER BY row->>'bucket'), '[]'::jsonb)
    INTO v_outreach_trend
    FROM (
      SELECT jsonb_build_object(
        'bucket',      to_char(dr.date, 'YYYY-MM-DD'),
        'brands',      SUM(COALESCE(dr.brands_contacted,0))::int,
        'influencers', SUM(COALESCE(dr.influencers_contacted,0))::int
      ) AS row
      FROM daily_reports dr
      WHERE dr.student_id = p_student_id
        AND dr.submitted_at IS NOT NULL
        AND dr.date >= v_start_date
      GROUP BY dr.date
    ) s;
  ELSIF v_bucket_mode = 'week' THEN
    SELECT COALESCE(jsonb_agg(row ORDER BY row->>'bucket'), '[]'::jsonb)
    INTO v_outreach_trend
    FROM (
      SELECT jsonb_build_object(
        'bucket',      to_char(public.week_start(dr.date), 'YYYY-MM-DD'),
        'brands',      SUM(COALESCE(dr.brands_contacted,0))::int,
        'influencers', SUM(COALESCE(dr.influencers_contacted,0))::int
      ) AS row
      FROM daily_reports dr
      WHERE dr.student_id = p_student_id
        AND dr.submitted_at IS NOT NULL
        AND dr.date >= v_start_date
      GROUP BY public.week_start(dr.date)
    ) s;
  ELSE -- 'month'
    SELECT COALESCE(jsonb_agg(row ORDER BY row->>'bucket'), '[]'::jsonb)
    INTO v_outreach_trend
    FROM (
      SELECT jsonb_build_object(
        'bucket',      to_char(date_trunc('month', dr.date)::date, 'YYYY-MM-DD'),
        'brands',      SUM(COALESCE(dr.brands_contacted,0))::int,
        'influencers', SUM(COALESCE(dr.influencers_contacted,0))::int
      ) AS row
      FROM daily_reports dr
      WHERE dr.student_id = p_student_id
        AND dr.submitted_at IS NOT NULL
        AND dr.date >= v_start_date
      GROUP BY date_trunc('month', dr.date)
    ) s;
  END IF;

  -- 8. Hours trend — same bucket rules as outreach.
  IF v_bucket_mode = 'day' THEN
    SELECT COALESCE(jsonb_agg(row ORDER BY row->>'bucket'), '[]'::jsonb)
    INTO v_hours_trend
    FROM (
      SELECT jsonb_build_object(
        'bucket', to_char(ws.date, 'YYYY-MM-DD'),
        'hours',  ROUND((SUM(ws.duration_minutes)::numeric / 60.0), 2)
      ) AS row
      FROM work_sessions ws
      WHERE ws.student_id = p_student_id
        AND ws.status = 'completed'
        AND ws.date >= v_start_date
      GROUP BY ws.date
    ) s;
  ELSIF v_bucket_mode = 'week' THEN
    SELECT COALESCE(jsonb_agg(row ORDER BY row->>'bucket'), '[]'::jsonb)
    INTO v_hours_trend
    FROM (
      SELECT jsonb_build_object(
        'bucket', to_char(public.week_start(ws.date), 'YYYY-MM-DD'),
        'hours',  ROUND((SUM(ws.duration_minutes)::numeric / 60.0), 2)
      ) AS row
      FROM work_sessions ws
      WHERE ws.student_id = p_student_id
        AND ws.status = 'completed'
        AND ws.date >= v_start_date
      GROUP BY public.week_start(ws.date)
    ) s;
  ELSE -- 'month'
    SELECT COALESCE(jsonb_agg(row ORDER BY row->>'bucket'), '[]'::jsonb)
    INTO v_hours_trend
    FROM (
      SELECT jsonb_build_object(
        'bucket', to_char(date_trunc('month', ws.date)::date, 'YYYY-MM-DD'),
        'hours',  ROUND((SUM(ws.duration_minutes)::numeric / 60.0), 2)
      ) AS row
      FROM work_sessions ws
      WHERE ws.student_id = p_student_id
        AND ws.status = 'completed'
        AND ws.date >= v_start_date
      GROUP BY date_trunc('month', ws.date)
    ) s;
  END IF;

  -- 9. Deal history (paginated, newest-first) + attribution role.
  SELECT COUNT(*) INTO v_total_deal_count
  FROM deals WHERE student_id = p_student_id;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'created_at') DESC), '[]'::jsonb)
  INTO v_deals
  FROM (
    SELECT jsonb_build_object(
      'id',          d.id,
      'deal_number', d.deal_number,
      'revenue',     d.revenue,
      'profit',      d.profit,
      'margin',      CASE WHEN d.revenue > 0
                          THEN ROUND((d.profit / d.revenue) * 100, 1)
                          ELSE 0
                     END,
      'created_at',  to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'logged_by',   d.logged_by,
      'logger_role', (SELECT u.role FROM users u WHERE u.id = d.logged_by),
      'is_self',     (d.logged_by = p_student_id)
    ) AS row
    FROM deals d
    WHERE d.student_id = p_student_id
    ORDER BY d.created_at DESC
    OFFSET v_offset
    LIMIT p_page_size
  ) s;

  v_deal_summary := jsonb_build_object(
    'count',   v_total_deal_count,
    'revenue', COALESCE((SELECT SUM(revenue) FROM deals WHERE student_id = p_student_id), 0),
    'profit',  COALESCE((SELECT SUM(profit)  FROM deals WHERE student_id = p_student_id), 0)
  );

  -- 10. Roadmap progress rows.
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'step_number')::int), '[]'::jsonb)
  INTO v_roadmap
  FROM (
    SELECT jsonb_build_object(
      'step_number', rp.step_number,
      'status',      rp.status,
      'completed_at', CASE WHEN rp.completed_at IS NULL
                           THEN NULL
                           ELSE to_char(rp.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                      END
    ) AS row
    FROM roadmap_progress rp
    WHERE rp.student_id = p_student_id
  ) s;

  -- 11. Assemble response.
  RETURN jsonb_build_object(
    'totals',            v_totals,
    'streak',            v_streak,
    'outreach_trend',    v_outreach_trend,
    'hours_trend',       v_hours_trend,
    'deals',             v_deals,
    'deal_summary',      v_deal_summary,
    'roadmap_progress',  v_roadmap,
    'range',             p_range,
    'page',              p_page,
    'page_size',         p_page_size,
    'total_deal_count',  v_total_deal_count
  );
END;
$$;

COMMENT ON FUNCTION public.get_student_analytics(uuid, text, int, int) IS
  'Phase 66 (v1.9): Daily/weekly/monthly range reshape. Outreach + hours trends share the same bucket mode. Outreach jsonb shape changed: week_start key → bucket key. Cache keys bumped to student-analytics-v4 in same commit series. Supersedes 00033.';

GRANT EXECUTE ON FUNCTION public.get_student_analytics(uuid, text, int, int)
  TO authenticated, service_role;

-- 3. Post-migration assert — exactly one overload must exist.
DO $assert$
BEGIN
  IF (SELECT COUNT(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_student_analytics') <> 1 THEN
    RAISE EXCEPTION 'Migration 00037 post-assert failed: get_student_analytics has <> 1 overload';
  END IF;
END $assert$;

COMMIT;
