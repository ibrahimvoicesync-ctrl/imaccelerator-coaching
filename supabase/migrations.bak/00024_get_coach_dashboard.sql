-- ============================================================================
-- Phase 47: Coach Dashboard Homepage Stats — batch RPC
-- Migration: 00024_get_coach_dashboard.sql
--
-- Creates a single batch RPC used by /coach (homepage):
--   public.get_coach_dashboard(p_coach_id, p_week_start, p_today)
--     RETURNS jsonb { stats, recent_reports, top_hours_week }
--     SECURITY DEFINER STABLE
--
-- Authorization: copies the Phase 46 pattern verbatim. If (SELECT auth.uid())
-- IS NOT NULL AND IS DISTINCT FROM p_coach_id we raise 'not_authorized'. The
-- service_role admin client (auth.uid() IS NULL) bypasses; the Next.js route
-- guarantees it has already checked that the caller's session matches the coach.
--
-- Depends on:
--   - Phase 44 (00021):
--       * idx_deals_student_created
--       * idx_work_sessions_completed_student_date
--       * idx_roadmap_progress_student_status
--       (These indexes back every aggregation here — do NOT re-declare.)
--   - Phase 45 (00022):
--       * deals.logged_by NOT NULL (not used by this RPC, but established baseline)
--
-- Cache layer: Next.js unstable_cache (60s TTL) wrapped by /coach page with
-- tag `coach-dashboard:${coachId}`; mutations on assigned-student deals /
-- reports / work_sessions invalidate that tag from API route handlers.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_coach_dashboard(
  p_coach_id   uuid,
  p_week_start date DEFAULT NULL,
  p_today      date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller          uuid := (SELECT auth.uid());
  v_week_start      date;
  v_student_ids     uuid[];
  v_deals_closed    int     := 0;
  v_revenue         numeric := 0;
  v_avg_step        numeric := 0;
  v_emails_sent     int     := 0;
  v_recent_reports  jsonb;
  v_top_hours_week  jsonb;
BEGIN
  -- 1. Authorization guard — coaches can only read their own dashboard.
  --    service_role callers (admin client) have auth.uid() IS NULL; allow,
  --    because the Next.js route handler has already verified session.user.id
  --    matches the coach. Mirrors Phase 46 (get_student_analytics) verbatim.
  IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM p_coach_id THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- 2. Resolve week start (ISO Monday). Falls back to date_trunc('week', today).
  v_week_start := COALESCE(p_week_start, date_trunc('week', p_today)::date);

  -- 3. Collect assigned active student ids in one shot.
  SELECT array_agg(id)
  INTO v_student_ids
  FROM users
  WHERE role = 'student'
    AND coach_id = p_coach_id
    AND status = 'active';

  -- 4. Zero-student short circuit — return zeros and empty arrays.
  IF v_student_ids IS NULL OR array_length(v_student_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'stats', jsonb_build_object(
        'deals_closed',     0,
        'revenue',          0,
        'avg_roadmap_step', 0,
        'emails_sent',      0
      ),
      'recent_reports', '[]'::jsonb,
      'top_hours_week', '[]'::jsonb
    );
  END IF;

  -- 5. Stats — assigned-students-scoped aggregates.

  -- ASSERT: deals_closed = COUNT(deals) where student_id IN assigned set.
  SELECT COALESCE(COUNT(*), 0)::int
  INTO v_deals_closed
  FROM deals
  WHERE student_id = ANY(v_student_ids);

  -- ASSERT: revenue = SUM(deals.revenue) (numeric USD; caller formats).
  SELECT COALESCE(SUM(revenue), 0)::numeric
  INTO v_revenue
  FROM deals
  WHERE student_id = ANY(v_student_ids);

  -- ASSERT: avg_roadmap_step = AVG(per-student MAX(step_number)
  --   FILTER status IN ('completed','active')) rounded to 1dp.
  SELECT COALESCE(ROUND(AVG(per_student_step)::numeric, 1), 0)::numeric
  INTO v_avg_step
  FROM (
    SELECT MAX(step_number) FILTER (WHERE status IN ('completed', 'active')) AS per_student_step
    FROM roadmap_progress
    WHERE student_id = ANY(v_student_ids)
    GROUP BY student_id
  ) s;

  -- ASSERT: emails_sent = SUM(brands_contacted + influencers_contacted) over
  --   submitted daily_reports for assigned students. The DB column historically
  --   was named outreach_count; Phase 46 (00023) settled on
  --   brands_contacted + influencers_contacted as the canonical "emails" metric
  --   (see total_emails in get_student_analytics) and we mirror that here.
  SELECT COALESCE(SUM(COALESCE(brands_contacted, 0) + COALESCE(influencers_contacted, 0)), 0)::int
  INTO v_emails_sent
  FROM daily_reports
  WHERE student_id = ANY(v_student_ids)
    AND submitted_at IS NOT NULL;

  -- 6. Recent reports — top 3 most recently submitted, joined with student name.
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'submitted_at') DESC NULLS LAST), '[]'::jsonb)
  INTO v_recent_reports
  FROM (
    SELECT jsonb_build_object(
      'id',           r.id,
      'student_id',   r.student_id,
      'student_name', u.name,
      'date',         to_char(r.date, 'YYYY-MM-DD'),
      'star_rating',  r.star_rating,
      'submitted_at', to_char(r.submitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ) AS row
    FROM daily_reports r
    JOIN users u ON u.id = r.student_id
    WHERE r.student_id = ANY(v_student_ids)
      AND r.submitted_at IS NOT NULL
    ORDER BY r.submitted_at DESC NULLS LAST
    LIMIT 3
  ) s;

  -- 7. Top-3 weekly hours — sum of completed work_session.duration_minutes
  --    between v_week_start and p_today inclusive, per assigned student,
  --    filtered to >0 minutes (no placeholder rows).
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'minutes')::int DESC), '[]'::jsonb)
  INTO v_top_hours_week
  FROM (
    SELECT jsonb_build_object(
      'student_id',   u.id,
      'student_name', u.name,
      'minutes',      COALESCE(SUM(ws.duration_minutes), 0)::int
    ) AS row
    FROM users u
    LEFT JOIN work_sessions ws
      ON ws.student_id = u.id
     AND ws.status     = 'completed'
     AND ws.date      >= v_week_start
     AND ws.date      <= p_today
    WHERE u.id = ANY(v_student_ids)
    GROUP BY u.id, u.name
    HAVING COALESCE(SUM(ws.duration_minutes), 0) > 0
    ORDER BY COALESCE(SUM(ws.duration_minutes), 0) DESC
    LIMIT 3
  ) s;

  -- 8. Final envelope.
  RETURN jsonb_build_object(
    'stats', jsonb_build_object(
      'deals_closed',     v_deals_closed,
      'revenue',          v_revenue,
      'avg_roadmap_step', v_avg_step,
      'emails_sent',      v_emails_sent
    ),
    'recent_reports', v_recent_reports,
    'top_hours_week', v_top_hours_week
  );
END;
$$;

-- Grants — service_role for admin client (server-side), authenticated for
-- direct supabase-js calls (guarded by the auth.uid() check above).
GRANT EXECUTE ON FUNCTION public.get_coach_dashboard(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_dashboard(uuid, date, date) TO authenticated;

-- ASSERT: Function exists with three parameters (uuid, date, date).
-- ASSERT: SECURITY DEFINER + STABLE + SET search_path = public.
-- ASSERT: Authorization guard rejects callers whose auth.uid() is set and != p_coach_id.
-- ASSERT: Returns jsonb with exactly three top-level keys: stats, recent_reports, top_hours_week.
-- ASSERT: stats jsonb has exactly four keys: deals_closed, revenue, avg_roadmap_step, emails_sent.
-- ASSERT: recent_reports has at most 3 entries; top_hours_week has at most 3 entries.
-- ASSERT: Zero assigned students returns zero-stats + empty arrays (no NULL leakage).
