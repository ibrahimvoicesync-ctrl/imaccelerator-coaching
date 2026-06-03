-- ============================================================================
-- Phase 35: Chat badges — extend get_sidebar_badges with unread_messages
-- Migration: 00017_chat_badges.sql
-- Adds unread_messages count for coach and student roles
-- NOTE: Broadcast read_at tracks first reader only (v1 approximation, see RESEARCH.md open question #1)
-- ============================================================================

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

  v_result         jsonb;
BEGIN
  -- -------------------------------------------------------------------------
  -- COACH ROLE: count unreviewed reports + 100h milestone alerts + unread messages
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
        AND u.joined_at >= CURRENT_DATE - 45
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

    -- Unread messages: count of messages sent TO this coach (recipient_id = p_user_id) that are unread
    SELECT count(*) INTO v_unread_count
    FROM messages
    WHERE coach_id = p_user_id
      AND recipient_id = p_user_id
      AND read_at IS NULL;

    RETURN jsonb_build_object(
      'unreviewed_reports', v_unreviewed_count,
      'coach_milestone_alerts', GREATEST(0, v_milestone_count - v_milestone_dismissed),
      'unread_messages', v_unread_count
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- STUDENT ROLE: count unread DMs + unread broadcasts from their coach
  -- -------------------------------------------------------------------------
  IF p_role = 'student' THEN
    -- Unread DMs sent to this student + unread broadcasts from their coach
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

    RETURN jsonb_build_object(
      'active_alerts', GREATEST(0, v_alert_count - v_dismissed_count),
      'unread_messages', 0
    );
  END IF;

  -- Any other role (student_diy or unknown): return empty object
  RETURN '{}'::jsonb;
END;
$$;
