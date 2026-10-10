-- =============================================================================
-- 00052 business_checkins
-- Students refresh a snapshot of their business every 30 days to keep the
-- "Ask Abu Lahya" AI unlocked (BUSINESS_CHECKIN in src/lib/config.ts). Every
-- submission is a new row, so history is kept; the gate reads the latest.
-- All reads/writes go through the service-role admin client; RLS is
-- defense-in-depth: students manage their own rows, coaches read their
-- students', owners read all.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.business_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Money
  total_revenue numeric(14,2) NOT NULL CHECK (total_revenue BETWEEN 0 AND 999999999999),
  revenue_target_next_month numeric(14,2) NOT NULL CHECK (revenue_target_next_month BETWEEN 0 AND 999999999999),
  liquid_capital_business numeric(14,2) NOT NULL CHECK (liquid_capital_business BETWEEN 0 AND 999999999999),
  liquid_capital_personal numeric(14,2) NOT NULL CHECK (liquid_capital_personal BETWEEN 0 AND 999999999999),
  monthly_expenses numeric(14,2) CHECK (monthly_expenses BETWEEN 0 AND 999999999999),
  -- Business
  current_goal text NOT NULL CHECK (char_length(current_goal) BETWEEN 1 AND 500),
  current_constraint text NOT NULL CHECK (char_length(current_constraint) BETWEEN 1 AND 500),
  employees integer NOT NULL CHECK (employees BETWEEN 0 AND 10000),
  influencers integer NOT NULL CHECK (influencers BETWEEN 0 AND 100000),
  brands integer NOT NULL CHECK (brands BETWEEN 0 AND 100000),
  hours_per_week integer CHECK (hours_per_week BETWEEN 0 AND 168),
  -- You
  feeling smallint NOT NULL CHECK (feeling BETWEEN 1 AND 5),
  feeling_note text CHECK (char_length(feeling_note) <= 500),
  biggest_win text CHECK (char_length(biggest_win) <= 500),
  help_wanted text CHECK (char_length(help_wanted) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_checkins_student_created
  ON public.business_checkins(student_id, created_at DESC);

ALTER TABLE public.business_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_checkins_self_select ON public.business_checkins;
CREATE POLICY business_checkins_self_select
  ON public.business_checkins
  FOR SELECT
  USING (student_id = (select get_user_id()));

DROP POLICY IF EXISTS business_checkins_self_insert ON public.business_checkins;
CREATE POLICY business_checkins_self_insert
  ON public.business_checkins
  FOR INSERT
  WITH CHECK (student_id = (select get_user_id()));

DROP POLICY IF EXISTS business_checkins_coach_select ON public.business_checkins;
CREATE POLICY business_checkins_coach_select
  ON public.business_checkins
  FOR SELECT
  USING (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  );

DROP POLICY IF EXISTS business_checkins_owner_select ON public.business_checkins;
CREATE POLICY business_checkins_owner_select
  ON public.business_checkins
  FOR SELECT
  USING ((select get_user_role()) = 'owner');

COMMIT;
