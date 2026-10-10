-- 00048: owner platform metrics — windowed total hours + roadmap stage funnel
--
-- A focused, parameterless RPC for the owner analytics page. Separate from
-- get_owner_analytics (leaderboards) so that giant function stays untouched.
--
-- Returns a jsonb envelope:
--   {
--     "total_students": <int>,
--     "hours":   { "weekly": <h>, "monthly": <h>, "ninety": <h>, "alltime": <h> },
--     "roadmap": [ { "step_number": 1, "students_reached": <int> }, … 16 ]
--   }
--
-- hours   = SUM(daily_reports.hours_worked) over student/student_diy, per
--           trailing-N-days window (7/30/90) + all-time, rounded to 1 decimal.
-- roadmap = per step N, count of students whose furthest reached step
--           (status active|completed) is >= N — i.e. cumulative "reached or
--           passed". Stage grouping is done in TS (config is source of truth).

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
  -- Admin (service-role) client only — auth.uid() is NULL for service_role.
  IF v_caller IS NOT NULL THEN
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

REVOKE EXECUTE ON FUNCTION public.get_owner_platform_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_owner_platform_metrics() TO service_role;
