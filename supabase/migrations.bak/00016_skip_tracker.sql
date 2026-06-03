-- ============================================================================
-- Phase 32: Skip Tracker RPC
-- Migration: 00016_skip_tracker.sql
--
-- SECURITY DEFINER function called via service_role (admin client).
-- STABLE (read-only). Returns JSONB map of student_id -> skip_count.
--
-- SYNC: deadlineHour threshold (23) must match DAILY_REPORT.deadlineHour
--       in src/lib/config.ts
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_weekly_skip_counts(
  p_student_ids  uuid[],
  p_today        date,
  p_current_hour integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ISO week: date_trunc('week', ...) returns the Monday of the week
  v_week_start   date := date_trunc('week', p_today)::date;
  -- D-02: today is only countable after deadlineHour (23 = 11 PM UTC)
  -- Before that hour, today is excluded from the count
  v_count_through date;
  v_result       jsonb := '{}'::jsonb;
  v_sid          uuid;
  v_skip_count   integer;
BEGIN
  -- Determine the last day eligible to count as a skip
  -- D-02: today is only countable after deadlineHour (23)
  IF p_current_hour >= 23 THEN
    v_count_through := p_today;
  ELSE
    v_count_through := p_today - interval '1 day';
  END IF;

  -- Edge case: if it is Monday before the deadline hour, no days to count yet
  -- (v_count_through would be the previous Sunday, before this week's start)
  IF v_count_through < v_week_start THEN
    -- Return 0 for all students — no countable days in the current ISO week
    FOREACH v_sid IN ARRAY p_student_ids LOOP
      v_result := v_result || jsonb_build_object(v_sid::text, 0);
    END LOOP;
    RETURN v_result;
  END IF;

  -- For each student, count days in [v_week_start, v_count_through] with no activity
  -- A day is a skip if the student had BOTH:
  --   - zero completed work sessions (status = 'completed')
  --   - zero submitted daily reports (submitted_at IS NOT NULL)
  FOREACH v_sid IN ARRAY p_student_ids LOOP
    SELECT count(*) INTO v_skip_count
    FROM generate_series(v_week_start, v_count_through, interval '1 day') AS d(day_date)
    WHERE NOT EXISTS (
      SELECT 1 FROM work_sessions ws
      WHERE ws.student_id = v_sid
        AND ws.date = d.day_date::date
        AND ws.status = 'completed'
    )
    AND NOT EXISTS (
      SELECT 1 FROM daily_reports dr
      WHERE dr.student_id = v_sid
        AND dr.date = d.day_date::date
        AND dr.submitted_at IS NOT NULL
    );

    v_result := v_result || jsonb_build_object(v_sid::text, v_skip_count);
  END LOOP;

  RETURN v_result;
END;
$$;
