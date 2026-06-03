-- ============================================================================
-- IMA Accelerator V1.1 -- Schema Foundation
-- Adds session_minutes to work_sessions, drops cycle_number cap constraint,
-- adds 5 KPI columns to daily_reports, updates restrict_coach_report_update
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section 1 — work_sessions: add session_minutes column (WORK-09)
-- ----------------------------------------------------------------------------

ALTER TABLE public.work_sessions
  ADD COLUMN session_minutes integer;

UPDATE public.work_sessions
  SET session_minutes = 45
  WHERE session_minutes IS NULL;

ALTER TABLE public.work_sessions
  ALTER COLUMN session_minutes SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Section 2 — work_sessions: drop cycle_number cap constraint (per D-01)
-- ----------------------------------------------------------------------------

ALTER TABLE public.work_sessions
  DROP CONSTRAINT IF EXISTS work_sessions_cycle_number_check;

-- ----------------------------------------------------------------------------
-- Section 3 — daily_reports: add 5 KPI columns (KPI-07)
-- ----------------------------------------------------------------------------

ALTER TABLE public.daily_reports
  ADD COLUMN outreach_brands       integer,
  ADD COLUMN outreach_influencers  integer,
  ADD COLUMN brands_contacted      integer,
  ADD COLUMN influencers_contacted integer,
  ADD COLUMN calls_joined          integer;

UPDATE public.daily_reports
  SET outreach_brands       = 0,
      outreach_influencers  = 0,
      brands_contacted      = 0,
      influencers_contacted = 0,
      calls_joined          = 0
  WHERE outreach_brands IS NULL;

ALTER TABLE public.daily_reports
  ALTER COLUMN outreach_brands       SET NOT NULL,
  ALTER COLUMN outreach_influencers  SET NOT NULL,
  ALTER COLUMN brands_contacted      SET NOT NULL,
  ALTER COLUMN influencers_contacted SET NOT NULL,
  ALTER COLUMN calls_joined          SET NOT NULL;

-- ----------------------------------------------------------------------------
-- Section 4 — Update restrict_coach_report_update trigger (atomicity rule)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.restrict_coach_report_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (select get_user_role()) = 'coach' THEN
    NEW.student_id              := OLD.student_id;
    NEW.date                    := OLD.date;
    NEW.hours_worked            := OLD.hours_worked;
    NEW.star_rating             := OLD.star_rating;
    NEW.outreach_count          := OLD.outreach_count;
    NEW.outreach_brands         := OLD.outreach_brands;
    NEW.outreach_influencers    := OLD.outreach_influencers;
    NEW.brands_contacted        := OLD.brands_contacted;
    NEW.influencers_contacted   := OLD.influencers_contacted;
    NEW.calls_joined            := OLD.calls_joined;
    NEW.wins                    := OLD.wins;
    NEW.improvements            := OLD.improvements;
    NEW.submitted_at            := OLD.submitted_at;
    NEW.created_at              := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;
