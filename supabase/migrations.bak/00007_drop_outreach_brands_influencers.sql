-- ============================================================================
-- IMA Accelerator — Drop redundant outreach_brands / outreach_influencers
-- Only brands_contacted, influencers_contacted, calls_joined remain.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Section 1 — Drop redundant columns
-- ----------------------------------------------------------------------------

ALTER TABLE public.daily_reports
  DROP COLUMN outreach_brands,
  DROP COLUMN outreach_influencers;

-- ----------------------------------------------------------------------------
-- Section 2 — Add DEFAULT 0 so inserts without these fields don't fail
-- ----------------------------------------------------------------------------

ALTER TABLE public.daily_reports
  ALTER COLUMN brands_contacted      SET DEFAULT 0,
  ALTER COLUMN influencers_contacted SET DEFAULT 0,
  ALTER COLUMN calls_joined          SET DEFAULT 0;

-- ----------------------------------------------------------------------------
-- Section 3 — Update restrict_coach_report_update trigger
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
