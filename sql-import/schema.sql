-- ============================================================================
-- IMA Accelerator — Complete Production Schema
-- Generated from migration files 00001 through 00043
-- Creates all 19 tables, functions, triggers, indexes, RLS policies, and grants
-- ============================================================================

SET search_path = public, extensions;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

-- ============================================================================
-- SECTION 1: TRIGGER & HELPER FUNCTIONS (no table dependencies)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- SECTION 2: TABLES (CREATE TABLE IF NOT EXISTS)
-- ============================================================================

-- 1. users
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid UNIQUE,
  email varchar(255) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('owner', 'coach', 'student', 'student_diy')),
  coach_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  niche varchar(255),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  streak_count integer NOT NULL DEFAULT 0,
  last_active_at timestamptz,
  referral_code varchar(12),
  referral_short_url text
);

-- 2. invites
CREATE TABLE IF NOT EXISTS public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('coach', 'student', 'student_diy')),
  invited_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  code varchar(64) NOT NULL UNIQUE,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

-- 3. magic_links
CREATE TABLE IF NOT EXISTS public.magic_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('coach', 'student', 'student_diy')),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  max_uses int DEFAULT 10,
  use_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. work_sessions
CREATE TABLE IF NOT EXISTS public.work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  cycle_number integer NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  duration_minutes integer NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  session_minutes integer NOT NULL
);

-- 5. roadmap_progress
CREATE TABLE IF NOT EXISTS public.roadmap_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  step_number integer NOT NULL CHECK (step_number >= 1 AND step_number <= 16),
  step_name varchar(255) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'active', 'completed')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. daily_reports
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  hours_worked decimal(4,2) NOT NULL DEFAULT 0,
  star_rating integer CHECK (star_rating BETWEEN 1 AND 5),
  outreach_count integer NOT NULL DEFAULT 0,
  wins text,
  improvements text,
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  brands_contacted integer NOT NULL DEFAULT 0,
  influencers_contacted integer NOT NULL DEFAULT 0,
  calls_joined integer NOT NULL DEFAULT 0
);

-- 7. alert_dismissals
CREATE TABLE IF NOT EXISTS public.alert_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  alert_key text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, alert_key)
);

-- 8. student_kpi_summaries
CREATE TABLE IF NOT EXISTS public.student_kpi_summaries (
  student_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  total_brands_contacted integer NOT NULL DEFAULT 0,
  total_influencers_contacted integer NOT NULL DEFAULT 0,
  total_hours_worked numeric(8,2) NOT NULL DEFAULT 0,
  total_calls_joined integer NOT NULL DEFAULT 0,
  total_reports integer NOT NULL DEFAULT 0,
  last_active_date date,
  current_streak integer NOT NULL DEFAULT 0,
  last_report_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. rate_limit_log
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  called_at timestamptz NOT NULL DEFAULT now()
);

-- 10. daily_plans
CREATE TABLE IF NOT EXISTS public.daily_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  plan_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. roadmap_undo_log
CREATE TABLE IF NOT EXISTS public.roadmap_undo_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_role text NOT NULL CHECK (actor_role IN ('coach', 'owner')),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  undone_at timestamptz NOT NULL DEFAULT now()
);

-- 12. report_comments
CREATE TABLE IF NOT EXISTS public.report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 13. resources
CREATE TABLE IF NOT EXISTS public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(255) NOT NULL,
  url text NOT NULL,
  comment text,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_pinned boolean NOT NULL DEFAULT false
);

-- 14. glossary_terms
CREATE TABLE IF NOT EXISTS public.glossary_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term varchar(255) NOT NULL,
  definition text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 15. deals
CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  deal_number integer NOT NULL,
  revenue numeric(12,2) NOT NULL CHECK (revenue >= 0),
  profit numeric(12,2) NOT NULL CHECK (profit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  logged_by uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE(student_id, deal_number)
);

-- 16. influencers
CREATE TABLE IF NOT EXISTS public.influencers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  influencer_name varchar(255) NOT NULL,
  platform varchar(50),
  followers integer,
  status varchar(20) NOT NULL DEFAULT 'contacted' CHECK (status IN ('contacted', 'responded', 'negotiating', 'signed', 'lost')),
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 17. announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 18. call_schedule
CREATE TABLE IF NOT EXISTS public.call_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed', 'rescheduled')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 19. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type varchar(50) NOT NULL,
  title varchar(255) NOT NULL,
  message text,
  read boolean NOT NULL DEFAULT false,
  action_url varchar(500),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- SECTION 3: INDEXES
-- ============================================================================

-- users indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_coach_id ON public.users(coach_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code
  ON public.users (referral_code)
  WHERE referral_code IS NOT NULL;

-- invites indexes
CREATE INDEX IF NOT EXISTS idx_invites_email ON public.invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_invited_by ON public.invites(invited_by);
CREATE INDEX IF NOT EXISTS idx_invites_coach_id ON public.invites(coach_id);

-- magic_links indexes
CREATE INDEX IF NOT EXISTS idx_magic_links_created_by ON public.magic_links(created_by);

-- work_sessions indexes
CREATE INDEX IF NOT EXISTS idx_work_sessions_student_date ON public.work_sessions(student_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_sessions_student_date_cycle ON public.work_sessions(student_id, date, cycle_number);
CREATE INDEX IF NOT EXISTS idx_work_sessions_student ON public.work_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_student_date_status ON public.work_sessions(student_id, date, status);
CREATE INDEX IF NOT EXISTS idx_work_sessions_completed_student_date
  ON public.work_sessions(student_id, date)
  WHERE status = 'completed';

-- roadmap_progress indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_roadmap_progress_student_step ON public.roadmap_progress(student_id, step_number);
CREATE INDEX IF NOT EXISTS idx_roadmap_progress_student ON public.roadmap_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_roadmap_progress_student_status ON public.roadmap_progress(student_id, status);

-- daily_reports indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_reports_student_date ON public.daily_reports(student_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON public.daily_reports(date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_student ON public.daily_reports(student_id);

-- alert_dismissals indexes
CREATE INDEX IF NOT EXISTS idx_alert_dismissals_owner ON public.alert_dismissals(owner_id);

-- rate_limit_log indexes
CREATE INDEX IF NOT EXISTS idx_rate_limit_user_endpoint_time
  ON public.rate_limit_log(user_id, endpoint, called_at DESC);

-- daily_plans indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_plans_student_date ON public.daily_plans(student_id, date);

-- roadmap_undo_log indexes
CREATE INDEX IF NOT EXISTS idx_roadmap_undo_log_student ON public.roadmap_undo_log(student_id);

-- report_comments indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_comments_report_id ON public.report_comments(report_id);

-- glossary_terms indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_glossary_terms_term_lower ON public.glossary_terms(lower(term));

-- deals indexes
CREATE INDEX IF NOT EXISTS idx_deals_student_created ON public.deals(student_id, created_at DESC);

-- influencers indexes
CREATE INDEX IF NOT EXISTS idx_influencers_student ON public.influencers(student_id);

-- announcements indexes
CREATE INDEX IF NOT EXISTS announcements_created_at_idx ON public.announcements(created_at DESC);

-- call_schedule indexes
CREATE INDEX IF NOT EXISTS idx_call_schedule_coach ON public.call_schedule(coach_id);
CREATE INDEX IF NOT EXISTS idx_call_schedule_student ON public.call_schedule(student_id);
CREATE INDEX IF NOT EXISTS idx_call_schedule_date ON public.call_schedule(scheduled_date);

-- notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);

-- ============================================================================
-- SECTION 4: RLS HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE auth_id = auth.uid()
$$;

-- ============================================================================
-- SECTION 5: ANALYTICS HELPER FUNCTIONS
-- ============================================================================

-- week_start(date) — IMMUTABLE, returns ISO Monday
CREATE OR REPLACE FUNCTION public.week_start(p_today date)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT date_trunc('week', p_today)::date;
$$;

-- student_activity_status(uuid, date) — returns 'active'/'inactive'
CREATE OR REPLACE FUNCTION public.student_activity_status(
  p_student_id uuid,
  p_today      date
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff date := p_today - 6;
BEGIN
  IF EXISTS (
    SELECT 1 FROM work_sessions ws
    WHERE ws.student_id = p_student_id
      AND ws.status = 'completed'
      AND ws.date BETWEEN v_cutoff AND p_today
  ) THEN
    RETURN 'active';
  END IF;

  IF EXISTS (
    SELECT 1 FROM daily_reports dr
    WHERE dr.student_id = p_student_id
      AND dr.submitted_at IS NOT NULL
      AND dr.date BETWEEN v_cutoff AND p_today
  ) THEN
    RETURN 'active';
  END IF;

  RETURN 'inactive';
END;
$$;

-- ============================================================================
-- SECTION 6: TRIGGER FUNCTIONS
-- ============================================================================

-- assign_deal_number() — auto-assigns next deal_number per student
CREATE OR REPLACE FUNCTION public.assign_deal_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deal_number IS NULL OR NEW.deal_number = 0 THEN
    SELECT COALESCE(MAX(deal_number), 0) + 1
      INTO NEW.deal_number
      FROM public.deals
     WHERE student_id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

-- deals_set_audit() — stamps updated_at + updated_by on deals
CREATE OR REPLACE FUNCTION public.deals_set_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
BEGIN
  v_actor := current_setting('app.current_user_id', true);

  NEW.updated_at := now();

  IF v_actor IS NOT NULL AND v_actor <> '' THEN
    BEGIN
      NEW.updated_by := v_actor::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- announcements_set_updated_at() — stamps updated_at on announcements
CREATE OR REPLACE FUNCTION public.announcements_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- restrict_coach_report_update() — coaches can only change reviewed_by/reviewed_at
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

-- restrict_self_update_users() — non-owners cannot change protected fields
CREATE OR REPLACE FUNCTION public.restrict_self_update_users()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (select get_user_role()) != 'owner' THEN
    NEW.role      := OLD.role;
    NEW.coach_id  := OLD.coach_id;
    NEW.auth_id   := OLD.auth_id;
    NEW.email     := OLD.email;
    NEW.joined_at := OLD.joined_at;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- SECTION 7: TRIGGERS
-- ============================================================================

-- users triggers
DROP TRIGGER IF EXISTS set_updated_at ON public.users;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS enforce_self_update_users ON public.users;
CREATE TRIGGER enforce_self_update_users
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.restrict_self_update_users();

-- roadmap_progress triggers
DROP TRIGGER IF EXISTS set_updated_at ON public.roadmap_progress;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.roadmap_progress
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- daily_reports triggers
DROP TRIGGER IF EXISTS enforce_coach_report_fields ON public.daily_reports;
CREATE TRIGGER enforce_coach_report_fields
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.restrict_coach_report_update();

-- report_comments triggers
DROP TRIGGER IF EXISTS set_updated_at ON public.report_comments;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.report_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- glossary_terms triggers
DROP TRIGGER IF EXISTS set_updated_at ON public.glossary_terms;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.glossary_terms
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- deals triggers
DROP TRIGGER IF EXISTS set_audit ON public.deals;
CREATE TRIGGER set_audit
  BEFORE INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_set_audit();

DROP TRIGGER IF EXISTS assign_deal_number ON public.deals;
CREATE TRIGGER assign_deal_number
  BEFORE INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.assign_deal_number();

-- influencers triggers
DROP TRIGGER IF EXISTS set_updated_at ON public.influencers;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.influencers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- announcements triggers
DROP TRIGGER IF EXISTS announcements_updated_at_trigger ON public.announcements;
CREATE TRIGGER announcements_updated_at_trigger
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.announcements_set_updated_at();

-- ============================================================================
-- SECTION 8: ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_kpi_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_undo_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glossary_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 9: RLS POLICIES
-- ============================================================================

-- ===== users =====

CREATE POLICY "owner_select_users" ON public.users
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_users" ON public.users
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND (id = (select get_user_id()) OR coach_id = (select get_user_id()))
  );

CREATE POLICY "student_select_users" ON public.users
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) IN ('student', 'student_diy')
    AND (
      id = (select get_user_id())
      OR id = (SELECT coach_id FROM public.users WHERE id = (select get_user_id()))
    )
  );

CREATE POLICY "owner_update_users" ON public.users
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'owner')
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_update_users" ON public.users
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'coach' AND id = (select get_user_id()))
  WITH CHECK ((select get_user_role()) = 'coach' AND id = (select get_user_id()));

CREATE POLICY "student_update_users" ON public.users
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND id = (select get_user_id()))
  WITH CHECK ((select get_user_role()) IN ('student', 'student_diy') AND id = (select get_user_id()));

-- ===== invites =====

CREATE POLICY "owner_select_invites" ON public.invites
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "owner_insert_invites" ON public.invites
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "owner_update_invites" ON public.invites
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'owner')
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_invites" ON public.invites
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'coach' AND invited_by = (select get_user_id()));

CREATE POLICY "coach_insert_invites" ON public.invites
  FOR INSERT TO authenticated
  WITH CHECK (
    (select get_user_role()) = 'coach'
    AND role = 'student'
    AND invited_by = (select get_user_id())
  );

-- ===== magic_links =====

CREATE POLICY "owner_select_magic_links" ON public.magic_links
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "owner_insert_magic_links" ON public.magic_links
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "owner_update_magic_links" ON public.magic_links
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'owner')
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_magic_links" ON public.magic_links
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND created_by = (select get_user_id())
  );

CREATE POLICY "coach_insert_magic_links" ON public.magic_links
  FOR INSERT TO authenticated
  WITH CHECK (
    (select get_user_role()) = 'coach'
    AND role = 'student'
    AND created_by = (select get_user_id())
  );

CREATE POLICY "coach_update_magic_links" ON public.magic_links
  FOR UPDATE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND created_by = (select get_user_id())
  )
  WITH CHECK (
    (select get_user_role()) = 'coach'
    AND created_by = (select get_user_id())
  );

-- ===== work_sessions =====

CREATE POLICY "owner_select_work_sessions" ON public.work_sessions
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_work_sessions" ON public.work_sessions
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  );

CREATE POLICY "student_select_work_sessions" ON public.work_sessions
  FOR SELECT TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "student_insert_work_sessions" ON public.work_sessions
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "student_update_work_sessions" ON public.work_sessions
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()))
  WITH CHECK ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "student_delete_work_sessions" ON public.work_sessions
  FOR DELETE TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

-- ===== roadmap_progress =====

CREATE POLICY "owner_select_roadmap" ON public.roadmap_progress
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_roadmap" ON public.roadmap_progress
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  );

CREATE POLICY "coach_update_roadmap" ON public.roadmap_progress
  FOR UPDATE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  )
  WITH CHECK (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  );

CREATE POLICY "student_select_roadmap" ON public.roadmap_progress
  FOR SELECT TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "student_update_roadmap" ON public.roadmap_progress
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()))
  WITH CHECK ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

-- ===== daily_reports =====

CREATE POLICY "owner_select_reports" ON public.daily_reports
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_reports" ON public.daily_reports
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  );

CREATE POLICY "coach_update_reports" ON public.daily_reports
  FOR UPDATE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  )
  WITH CHECK (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  );

CREATE POLICY "student_select_reports" ON public.daily_reports
  FOR SELECT TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "student_insert_reports" ON public.daily_reports
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "student_update_reports" ON public.daily_reports
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()))
  WITH CHECK ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

-- ===== alert_dismissals =====

CREATE POLICY "owner_select_dismissals" ON public.alert_dismissals
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner' AND owner_id = (select get_user_id()));

CREATE POLICY "owner_insert_dismissals" ON public.alert_dismissals
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'owner' AND owner_id = (select get_user_id()));

CREATE POLICY "coach_select_dismissals" ON public.alert_dismissals
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'coach' AND owner_id = (select get_user_id()));

CREATE POLICY "coach_insert_dismissals" ON public.alert_dismissals
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'coach' AND owner_id = (select get_user_id()));

-- ===== daily_plans =====

CREATE POLICY "student_select_daily_plans" ON public.daily_plans
  FOR SELECT TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "student_insert_daily_plans" ON public.daily_plans
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "coach_select_daily_plans" ON public.daily_plans
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  );

CREATE POLICY "owner_select_daily_plans" ON public.daily_plans
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

-- ===== roadmap_undo_log =====

CREATE POLICY "coach_insert_roadmap_undo_log" ON public.roadmap_undo_log
  FOR INSERT TO authenticated
  WITH CHECK (
    (select get_user_role()) = 'coach'
    AND actor_id = (select get_user_id())
  );

CREATE POLICY "owner_insert_roadmap_undo_log" ON public.roadmap_undo_log
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_roadmap_undo_log" ON public.roadmap_undo_log
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND actor_id = (select get_user_id())
  );

CREATE POLICY "owner_select_roadmap_undo_log" ON public.roadmap_undo_log
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

-- ===== report_comments =====

CREATE POLICY "owner_select_report_comments" ON public.report_comments
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_report_comments" ON public.report_comments
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND report_id IN (
      SELECT dr.id FROM public.daily_reports dr
      JOIN public.users s ON s.id = dr.student_id
      WHERE s.coach_id = (select get_user_id())
    )
  );

CREATE POLICY "student_select_report_comments" ON public.report_comments
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) IN ('student', 'student_diy')
    AND report_id IN (
      SELECT dr.id FROM public.daily_reports dr
      WHERE dr.student_id = (select get_user_id())
    )
  );

CREATE POLICY "owner_insert_report_comments" ON public.report_comments
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_insert_report_comments" ON public.report_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    (select get_user_role()) = 'coach'
    AND coach_id = (select get_user_id())
    AND report_id IN (
      SELECT dr.id FROM public.daily_reports dr
      JOIN public.users s ON s.id = dr.student_id
      WHERE s.coach_id = (select get_user_id())
    )
  );

CREATE POLICY "owner_update_report_comments" ON public.report_comments
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_update_report_comments" ON public.report_comments
  FOR UPDATE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND coach_id = (select get_user_id())
  );

-- ===== resources =====

CREATE POLICY "owner_select_resources" ON public.resources
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_resources" ON public.resources
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'coach');

CREATE POLICY "student_select_resources" ON public.resources
  FOR SELECT TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy'));

CREATE POLICY "owner_insert_resources" ON public.resources
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_insert_resources" ON public.resources
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'coach');

CREATE POLICY "owner_delete_resources" ON public.resources
  FOR DELETE TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_delete_resources" ON public.resources
  FOR DELETE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND created_by = (select get_user_id())
  );

-- ===== glossary_terms =====

CREATE POLICY "owner_select_glossary_terms" ON public.glossary_terms
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_glossary_terms" ON public.glossary_terms
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'coach');

CREATE POLICY "student_select_glossary_terms" ON public.glossary_terms
  FOR SELECT TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy'));

CREATE POLICY "owner_insert_glossary_terms" ON public.glossary_terms
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_insert_glossary_terms" ON public.glossary_terms
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'coach');

CREATE POLICY "owner_update_glossary_terms" ON public.glossary_terms
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_update_glossary_terms" ON public.glossary_terms
  FOR UPDATE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND created_by = (select get_user_id())
  );

CREATE POLICY "owner_delete_glossary_terms" ON public.glossary_terms
  FOR DELETE TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_delete_glossary_terms" ON public.glossary_terms
  FOR DELETE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND created_by = (select get_user_id())
  );

-- ===== deals =====

CREATE POLICY "owner_select_deals" ON public.deals
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_deals" ON public.deals
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  );

CREATE POLICY "student_select_deals" ON public.deals
  FOR SELECT TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "student_insert_deals" ON public.deals
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "coach_insert_deals" ON public.deals
  FOR INSERT TO authenticated
  WITH CHECK (
    (select get_user_role()) = 'coach'
    AND student_id IN (
      SELECT id FROM public.users WHERE coach_id = (select get_user_id())
    )
    AND logged_by = (select get_user_id())
  );

CREATE POLICY "owner_insert_deals" ON public.deals
  FOR INSERT TO authenticated
  WITH CHECK (
    (select get_user_role()) = 'owner'
    AND logged_by = (select get_user_id())
  );

CREATE POLICY "owner_update_deals" ON public.deals
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'owner')
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_update_deals" ON public.deals
  FOR UPDATE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  )
  WITH CHECK (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  );

CREATE POLICY "owner_delete_deals" ON public.deals
  FOR DELETE TO authenticated
  USING ((select get_user_role()) = 'owner');

-- ===== influencers =====

CREATE POLICY "owner_select_influencers" ON public.influencers
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_influencers" ON public.influencers
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  );

CREATE POLICY "student_select_influencers" ON public.influencers
  FOR SELECT TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "student_insert_influencers" ON public.influencers
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "student_update_influencers" ON public.influencers
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()))
  WITH CHECK ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

-- ===== announcements =====

CREATE POLICY "announcements_select_authenticated" ON public.announcements
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "announcements_insert_owner_coach" ON public.announcements
  FOR INSERT
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('owner', 'coach')
    )
  );

CREATE POLICY "announcements_update_own" ON public.announcements
  FOR UPDATE
  USING (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('owner', 'coach')
    )
  )
  WITH CHECK (
    author_id = (SELECT auth.uid())
  );

CREATE POLICY "announcements_delete_own" ON public.announcements
  FOR DELETE
  USING (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.role IN ('owner', 'coach')
    )
  );

-- ===== call_schedule =====

CREATE POLICY "owner_select_call_schedule" ON public.call_schedule
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_call_schedule" ON public.call_schedule
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'coach' AND coach_id = (select get_user_id()));

CREATE POLICY "student_select_call_schedule" ON public.call_schedule
  FOR SELECT TO authenticated
  USING ((select get_user_role()) IN ('student', 'student_diy') AND student_id = (select get_user_id()));

CREATE POLICY "owner_insert_call_schedule" ON public.call_schedule
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_insert_call_schedule" ON public.call_schedule
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'coach' AND coach_id = (select get_user_id()));

CREATE POLICY "owner_update_call_schedule" ON public.call_schedule
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'owner')
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_update_call_schedule" ON public.call_schedule
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'coach' AND coach_id = (select get_user_id()))
  WITH CHECK ((select get_user_role()) = 'coach' AND coach_id = (select get_user_id()));

-- ===== notifications =====

CREATE POLICY "owner_select_notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "user_select_notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (select get_user_id()));

CREATE POLICY "user_update_notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (select get_user_id()))
  WITH CHECK (user_id = (select get_user_id()));

-- ============================================================================
-- SECTION 10: RPC FUNCTIONS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- get_owner_dashboard_stats()
-- ---------------------------------------------------------------------------
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
  SELECT jsonb_build_object(
    'total_students',     (SELECT count(*) FROM users WHERE role IN ('student','student_diy') AND status = 'active'),
    'total_coaches',      (SELECT count(*) FROM users WHERE role = 'coach' AND status = 'active'),
    'active_today_count', (SELECT count(DISTINCT student_id) FROM work_sessions WHERE date = v_today),
    'reports_today',      (SELECT count(*) FROM daily_reports WHERE date = v_today AND submitted_at IS NOT NULL)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_sidebar_badges(p_user_id, p_role) — Phase 65 final version
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sidebar_badges(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_inbox_days integer := 7;
  v_today date := CURRENT_DATE;
  v_unreviewed_count     integer := 0;
  v_student              RECORD;
  v_milestone_count      integer := 0;
  v_milestone_dismissed  integer := 0;
  v_deal_count       integer := 0;
  v_dismissed_count  integer := 0;
BEGIN
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

    SELECT count(*)
      INTO v_milestone_dismissed
      FROM alert_dismissals
     WHERE owner_id = p_user_id
       AND alert_key LIKE '100h_milestone:%';

    RETURN jsonb_build_object(
      'unreviewed_reports', v_unreviewed_count,
      'coach_milestone_alerts', GREATEST(0, v_milestone_count - v_milestone_dismissed)
    );
  END IF;

  IF p_role = 'student' THEN
    RETURN '{}'::jsonb;
  END IF;

  IF p_role = 'owner' THEN
    SELECT COUNT(*)
      INTO v_deal_count
      FROM deals d
     WHERE d.created_at >= NOW() - INTERVAL '30 days';

    SELECT COUNT(*)
      INTO v_dismissed_count
      FROM alert_dismissals ad
      JOIN deals d
        ON d.id::text = split_part(ad.alert_key, ':', 2)
     WHERE ad.owner_id = p_user_id
       AND ad.alert_key LIKE 'deal_closed:%'
       AND d.created_at >= NOW() - INTERVAL '30 days';

    RETURN jsonb_build_object(
      'active_alerts', GREATEST(0, v_deal_count - v_dismissed_count)
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_student_detail(p_student_id, p_month_start, p_month_end, p_include_coach_mgmt)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- get_weekly_skip_counts(p_student_ids, p_today, p_current_hour)
-- ---------------------------------------------------------------------------
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
  v_week_start   date := date_trunc('week', p_today)::date;
  v_count_through date;
  v_result       jsonb := '{}'::jsonb;
  v_sid          uuid;
  v_skip_count   integer;
BEGIN
  IF p_current_hour >= 23 THEN
    v_count_through := p_today;
  ELSE
    v_count_through := p_today - interval '1 day';
  END IF;

  IF v_count_through < v_week_start THEN
    FOREACH v_sid IN ARRAY p_student_ids LOOP
      v_result := v_result || jsonb_build_object(v_sid::text, 0);
    END LOOP;
    RETURN v_result;
  END IF;

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

-- ---------------------------------------------------------------------------
-- refresh_student_kpi_summaries() — batch nightly aggregation job
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- get_student_analytics(uuid, text, int, int) — Phase 66 final version
-- ---------------------------------------------------------------------------
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
  v_bucket_mode      text;
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
  IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM p_student_id THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_range NOT IN ('daily','weekly','monthly') THEN
    RAISE EXCEPTION 'invalid_range: %', p_range USING ERRCODE = '22023';
  END IF;

  IF p_range = 'daily' THEN
    v_start_date  := v_today - 11;
    v_bucket_mode := 'day';
  ELSIF p_range = 'weekly' THEN
    v_start_date  := v_today - 83;
    v_bucket_mode := 'week';
  ELSE
    v_start_date  := (date_trunc('month', v_today) - interval '11 months')::date;
    v_bucket_mode := 'month';
  END IF;

  IF p_page < 1 THEN p_page := 1; END IF;
  IF p_page_size < 1 THEN p_page_size := 25; END IF;
  IF p_page_size > 100 THEN p_page_size := 100; END IF;
  v_offset := (p_page - 1) * p_page_size;

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
  ELSE
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
  ELSE
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

-- ---------------------------------------------------------------------------
-- get_coach_analytics(...) — Phase 48 full coach analytics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_analytics(
  p_coach_id          uuid,
  p_window_days       int     DEFAULT 7,
  p_today             date    DEFAULT CURRENT_DATE,
  p_leaderboard_limit int     DEFAULT 5,
  p_page              int     DEFAULT 1,
  p_page_size         int     DEFAULT 25,
  p_sort              text    DEFAULT 'name_asc',
  p_search            text    DEFAULT NULL
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
  v_trend_start     date;
  v_student_ids     uuid[];
  v_search          text;
  v_window_days     int;
  v_lb_limit        int;
  v_page            int;
  v_page_size       int;
  v_offset          int;
  v_total           int := 0;
  v_stats           jsonb;
  v_leaderboards    jsonb;
  v_deals_trend     jsonb;
  v_active_inactive jsonb;
  v_students        jsonb;
  v_active_count    int := 0;
  v_inactive_count  int := 0;
BEGIN
  IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM p_coach_id THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_window_days := LEAST(GREATEST(COALESCE(p_window_days, 7), 1), 365);
  v_lb_limit    := LEAST(GREATEST(COALESCE(p_leaderboard_limit, 5), 1), 50);
  v_page        := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size   := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 5000);
  v_offset      := (v_page - 1) * v_page_size;
  v_search      := NULLIF(TRIM(COALESCE(p_search, '')), '');

  v_week_start  := date_trunc('week', p_today)::date;
  v_trend_start := v_week_start - INTERVAL '11 weeks';

  SELECT array_agg(id)
  INTO v_student_ids
  FROM users
  WHERE role IN ('student','student_diy')
    AND coach_id = p_coach_id
    AND status = 'active';

  IF v_student_ids IS NULL OR array_length(v_student_ids, 1) IS NULL THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'week_start', to_char(wk, 'YYYY-MM-DD'),
          'deals',      0
        )
        ORDER BY wk
      ),
      '[]'::jsonb
    )
    INTO v_deals_trend
    FROM generate_series(v_trend_start, v_week_start, INTERVAL '1 week') AS gs(wk);

    RETURN jsonb_build_object(
      'stats', jsonb_build_object(
        'highest_deals',     jsonb_build_object('student_id', NULL, 'student_name', NULL, 'count', 0),
        'total_revenue',     0,
        'avg_roadmap_step',  0,
        'avg_email_count',   0,
        'most_emails',       jsonb_build_object('student_id', NULL, 'student_name', NULL, 'count', 0)
      ),
      'leaderboards', jsonb_build_object(
        'hours_week',     '[]'::jsonb,
        'emails_week',    '[]'::jsonb,
        'deals_alltime',  '[]'::jsonb
      ),
      'deals_trend', v_deals_trend,
      'active_inactive', jsonb_build_object('active', 0, 'inactive', 0),
      'students', '[]'::jsonb,
      'pagination', jsonb_build_object(
        'page',        v_page,
        'page_size',   v_page_size,
        'total',       0,
        'total_pages', 0
      )
    );
  END IF;

  SELECT COALESCE(
    jsonb_build_object(
      'student_id',   s.student_id,
      'student_name', s.student_name,
      'count',        s.cnt
    ),
    jsonb_build_object('student_id', NULL, 'student_name', NULL, 'count', 0)
  )
  INTO v_stats
  FROM (
    SELECT d.student_id, u.name AS student_name, COUNT(*)::int AS cnt
    FROM deals d
    JOIN users u ON u.id = d.student_id
    WHERE d.student_id = ANY(v_student_ids)
    GROUP BY d.student_id, u.name
    ORDER BY cnt DESC, LOWER(u.name) ASC
    LIMIT 1
  ) s;

  IF v_stats IS NULL THEN
    v_stats := jsonb_build_object('student_id', NULL, 'student_name', NULL, 'count', 0);
  END IF;

  v_stats := jsonb_build_object(
    'highest_deals',    v_stats,
    'total_revenue',    (
      SELECT COALESCE(SUM(revenue), 0)::numeric
      FROM deals
      WHERE student_id = ANY(v_student_ids)
    ),
    'avg_roadmap_step', (
      SELECT COALESCE(ROUND(AVG(per_student_step)::numeric, 1), 0)::numeric
      FROM (
        SELECT MAX(step_number) FILTER (WHERE status IN ('completed', 'active')) AS per_student_step
        FROM roadmap_progress
        WHERE student_id = ANY(v_student_ids)
        GROUP BY student_id
      ) t
    ),
    'avg_email_count',  (
      SELECT COALESCE(ROUND(AVG(per_student_emails)::numeric, 0), 0)::numeric
      FROM (
        SELECT
          COALESCE(SUM(COALESCE(brands_contacted, 0) + COALESCE(influencers_contacted, 0)), 0)::int AS per_student_emails
        FROM daily_reports
        WHERE student_id = ANY(v_student_ids)
          AND submitted_at IS NOT NULL
        GROUP BY student_id
      ) t
    ),
    'most_emails',      (
      SELECT COALESCE(
        jsonb_build_object(
          'student_id',   s.student_id,
          'student_name', s.student_name,
          'count',        s.cnt
        ),
        jsonb_build_object('student_id', NULL, 'student_name', NULL, 'count', 0)
      )
      FROM (
        SELECT
          r.student_id,
          u.name AS student_name,
          SUM(COALESCE(r.brands_contacted, 0) + COALESCE(r.influencers_contacted, 0))::int AS cnt
        FROM daily_reports r
        JOIN users u ON u.id = r.student_id
        WHERE r.student_id = ANY(v_student_ids)
          AND r.submitted_at IS NOT NULL
        GROUP BY r.student_id, u.name
        ORDER BY cnt DESC, LOWER(u.name) ASC
        LIMIT 1
      ) s
    )
  );

  IF v_stats->'most_emails' IS NULL OR v_stats->'most_emails' = 'null'::jsonb THEN
    v_stats := jsonb_set(
      v_stats,
      '{most_emails}',
      jsonb_build_object('student_id', NULL, 'student_name', NULL, 'count', 0),
      true
    );
  END IF;

  WITH hours_rows AS (
    SELECT
      u.id   AS student_id,
      u.name AS student_name,
      COALESCE(SUM(ws.duration_minutes), 0)::int AS minutes
    FROM users u
    LEFT JOIN work_sessions ws
      ON ws.student_id = u.id
     AND ws.status = 'completed'
     AND ws.date >= v_week_start
     AND ws.date <= p_today
    WHERE u.id = ANY(v_student_ids)
    GROUP BY u.id, u.name
    HAVING COALESCE(SUM(ws.duration_minutes), 0) > 0
  ),
  hours_ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY minutes DESC, LOWER(student_name) ASC)::int AS rank,
      student_id, student_name, minutes
    FROM hours_rows
  ),
  emails_rows AS (
    SELECT
      r.student_id,
      u.name AS student_name,
      SUM(COALESCE(r.brands_contacted, 0) + COALESCE(r.influencers_contacted, 0))::int AS emails
    FROM daily_reports r
    JOIN users u ON u.id = r.student_id
    WHERE r.student_id = ANY(v_student_ids)
      AND r.submitted_at IS NOT NULL
      AND r.date >= v_week_start
      AND r.date <= p_today
    GROUP BY r.student_id, u.name
    HAVING SUM(COALESCE(r.brands_contacted, 0) + COALESCE(r.influencers_contacted, 0)) > 0
  ),
  emails_ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY emails DESC, LOWER(student_name) ASC)::int AS rank,
      student_id, student_name, emails
    FROM emails_rows
  ),
  deals_rows AS (
    SELECT
      d.student_id,
      u.name AS student_name,
      COUNT(*)::int AS deals
    FROM deals d
    JOIN users u ON u.id = d.student_id
    WHERE d.student_id = ANY(v_student_ids)
    GROUP BY d.student_id, u.name
    HAVING COUNT(*) > 0
  ),
  deals_ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY deals DESC, LOWER(student_name) ASC)::int AS rank,
      student_id, student_name, deals
    FROM deals_rows
  )
  SELECT jsonb_build_object(
    'hours_week', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rank', rank, 'student_id', student_id, 'student_name', student_name, 'minutes', minutes
      ) ORDER BY rank)
      FROM hours_ranked WHERE rank <= v_lb_limit
    ), '[]'::jsonb),
    'emails_week', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rank', rank, 'student_id', student_id, 'student_name', student_name, 'emails', emails
      ) ORDER BY rank)
      FROM emails_ranked WHERE rank <= v_lb_limit
    ), '[]'::jsonb),
    'deals_alltime', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rank', rank, 'student_id', student_id, 'student_name', student_name, 'deals', deals
      ) ORDER BY rank)
      FROM deals_ranked WHERE rank <= v_lb_limit
    ), '[]'::jsonb)
  )
  INTO v_leaderboards;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'week_start') ASC), '[]'::jsonb)
  INTO v_deals_trend
  FROM (
    SELECT jsonb_build_object(
      'week_start', to_char(wk, 'YYYY-MM-DD'),
      'deals',      COALESCE(d.cnt, 0)::int
    ) AS row
    FROM generate_series(v_trend_start, v_week_start, INTERVAL '1 week') AS gs(wk)
    LEFT JOIN (
      SELECT date_trunc('week', created_at)::date AS wk, COUNT(*)::int AS cnt
      FROM deals
      WHERE student_id = ANY(v_student_ids)
        AND created_at >= v_trend_start
        AND created_at < v_week_start + INTERVAL '7 days'
      GROUP BY date_trunc('week', created_at)
    ) d ON d.wk = gs.wk::date
  ) s;

  SELECT
    COUNT(*) FILTER (WHERE public.student_activity_status(id, p_today) = 'active')::int,
    COUNT(*) FILTER (WHERE public.student_activity_status(id, p_today) = 'inactive')::int
  INTO v_active_count, v_inactive_count
  FROM users
  WHERE id = ANY(v_student_ids);

  v_active_inactive := jsonb_build_object(
    'active',   COALESCE(v_active_count, 0),
    'inactive', COALESCE(v_inactive_count, 0)
  );

  WITH per_student AS (
    SELECT
      u.id   AS student_id,
      u.name AS name,
      COALESCE((SELECT SUM(ws.duration_minutes)::int FROM work_sessions ws WHERE ws.student_id = u.id AND ws.status = 'completed' AND ws.date >= v_week_start AND ws.date <= p_today), 0)::int AS hours_this_week_minutes,
      COALESCE((SELECT SUM(COALESCE(r.brands_contacted, 0) + COALESCE(r.influencers_contacted, 0))::int FROM daily_reports r WHERE r.student_id = u.id AND r.submitted_at IS NOT NULL AND r.date >= v_week_start AND r.date <= p_today), 0)::int AS emails_this_week,
      COALESCE((SELECT COUNT(*)::int FROM deals d WHERE d.student_id = u.id), 0)::int AS deals_alltime,
      COALESCE((SELECT MAX(rp.step_number) FROM roadmap_progress rp WHERE rp.student_id = u.id AND rp.status IN ('completed', 'active')), 0)::int AS roadmap_step,
      (SELECT GREATEST((SELECT MAX(ws.date) FROM work_sessions ws WHERE ws.student_id = u.id AND ws.status = 'completed'), (SELECT MAX(r.date) FROM daily_reports r WHERE r.student_id = u.id AND r.submitted_at IS NOT NULL))) AS last_active_date,
      public.student_activity_status(u.id, p_today) AS activity_status
    FROM users u
    WHERE u.id = ANY(v_student_ids)
      AND (v_search IS NULL OR u.name ILIKE '%' || v_search || '%')
  )
  SELECT COUNT(*)::int INTO v_total FROM per_student;

  WITH per_student AS (
    SELECT
      u.id   AS student_id,
      u.name AS name,
      COALESCE((SELECT SUM(ws.duration_minutes)::int FROM work_sessions ws WHERE ws.student_id = u.id AND ws.status = 'completed' AND ws.date >= v_week_start AND ws.date <= p_today), 0)::int AS hours_this_week_minutes,
      COALESCE((SELECT SUM(COALESCE(r.brands_contacted, 0) + COALESCE(r.influencers_contacted, 0))::int FROM daily_reports r WHERE r.student_id = u.id AND r.submitted_at IS NOT NULL AND r.date >= v_week_start AND r.date <= p_today), 0)::int AS emails_this_week,
      COALESCE((SELECT COUNT(*)::int FROM deals d WHERE d.student_id = u.id), 0)::int AS deals_alltime,
      COALESCE((SELECT MAX(rp.step_number) FROM roadmap_progress rp WHERE rp.student_id = u.id AND rp.status IN ('completed', 'active')), 0)::int AS roadmap_step,
      (SELECT GREATEST((SELECT MAX(ws.date) FROM work_sessions ws WHERE ws.student_id = u.id AND ws.status = 'completed'), (SELECT MAX(r.date) FROM daily_reports r WHERE r.student_id = u.id AND r.submitted_at IS NOT NULL))) AS last_active_date,
      public.student_activity_status(u.id, p_today) AS activity_status
    FROM users u
    WHERE u.id = ANY(v_student_ids)
      AND (v_search IS NULL OR u.name ILIKE '%' || v_search || '%')
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'student_id',              page_rows.student_id,
    'name',                    page_rows.name,
    'hours_this_week_minutes', page_rows.hours_this_week_minutes,
    'emails_this_week',        page_rows.emails_this_week,
    'deals_alltime',           page_rows.deals_alltime,
    'roadmap_step',            page_rows.roadmap_step,
    'last_active_date',        CASE WHEN page_rows.last_active_date IS NULL THEN NULL ELSE to_char(page_rows.last_active_date, 'YYYY-MM-DD') END,
    'activity_status',         page_rows.activity_status
  ) ORDER BY page_rows.row_pos), '[]'::jsonb)
  INTO v_students
  FROM (
    SELECT
      ROW_NUMBER() OVER (ORDER BY
        CASE WHEN p_sort = 'name_asc'         THEN LOWER(name)             END ASC  NULLS LAST,
        CASE WHEN p_sort = 'name_desc'        THEN LOWER(name)             END DESC NULLS LAST,
        CASE WHEN p_sort = 'hours_asc'        THEN hours_this_week_minutes END ASC  NULLS LAST,
        CASE WHEN p_sort = 'hours_desc'       THEN hours_this_week_minutes END DESC NULLS LAST,
        CASE WHEN p_sort = 'emails_asc'       THEN emails_this_week        END ASC  NULLS LAST,
        CASE WHEN p_sort = 'emails_desc'      THEN emails_this_week        END DESC NULLS LAST,
        CASE WHEN p_sort = 'deals_asc'        THEN deals_alltime           END ASC  NULLS LAST,
        CASE WHEN p_sort = 'deals_desc'       THEN deals_alltime           END DESC NULLS LAST,
        CASE WHEN p_sort = 'step_asc'         THEN roadmap_step            END ASC  NULLS LAST,
        CASE WHEN p_sort = 'step_desc'        THEN roadmap_step            END DESC NULLS LAST,
        CASE WHEN p_sort = 'lastActive_asc'   THEN last_active_date        END ASC  NULLS LAST,
        CASE WHEN p_sort = 'lastActive_desc'  THEN last_active_date        END DESC NULLS LAST,
        LOWER(name) ASC
      ) AS row_pos,
      *
    FROM per_student
    ORDER BY
      CASE WHEN p_sort = 'name_asc'         THEN LOWER(name)             END ASC  NULLS LAST,
      CASE WHEN p_sort = 'name_desc'        THEN LOWER(name)             END DESC NULLS LAST,
      CASE WHEN p_sort = 'hours_asc'        THEN hours_this_week_minutes END ASC  NULLS LAST,
      CASE WHEN p_sort = 'hours_desc'       THEN hours_this_week_minutes END DESC NULLS LAST,
      CASE WHEN p_sort = 'emails_asc'       THEN emails_this_week        END ASC  NULLS LAST,
      CASE WHEN p_sort = 'emails_desc'      THEN emails_this_week        END DESC NULLS LAST,
      CASE WHEN p_sort = 'deals_asc'        THEN deals_alltime           END ASC  NULLS LAST,
      CASE WHEN p_sort = 'deals_desc'       THEN deals_alltime           END DESC NULLS LAST,
      CASE WHEN p_sort = 'step_asc'         THEN roadmap_step            END ASC  NULLS LAST,
      CASE WHEN p_sort = 'step_desc'        THEN roadmap_step            END DESC NULLS LAST,
      CASE WHEN p_sort = 'lastActive_asc'   THEN last_active_date        END ASC  NULLS LAST,
      CASE WHEN p_sort = 'lastActive_desc'  THEN last_active_date        END DESC NULLS LAST,
      LOWER(name) ASC
    OFFSET v_offset
    LIMIT v_page_size
  ) page_rows;

  RETURN jsonb_build_object(
    'stats',           v_stats,
    'leaderboards',    v_leaderboards,
    'deals_trend',     v_deals_trend,
    'active_inactive', v_active_inactive,
    'students',        v_students,
    'pagination', jsonb_build_object(
      'page',        v_page,
      'page_size',   v_page_size,
      'total',       v_total,
      'total_pages', CASE WHEN v_page_size = 0 THEN 0 ELSE CEIL(v_total::numeric / v_page_size)::int END
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- get_coach_dashboard(p_coach_id, p_week_start, p_today) — Phase 47
-- ---------------------------------------------------------------------------
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
  IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM p_coach_id THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_week_start := COALESCE(p_week_start, date_trunc('week', p_today)::date);

  SELECT array_agg(id)
  INTO v_student_ids
  FROM users
  WHERE role IN ('student','student_diy')
    AND coach_id = p_coach_id
    AND status = 'active';

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

  SELECT COALESCE(COUNT(*), 0)::int INTO v_deals_closed
  FROM deals WHERE student_id = ANY(v_student_ids);

  SELECT COALESCE(SUM(revenue), 0)::numeric INTO v_revenue
  FROM deals WHERE student_id = ANY(v_student_ids);

  SELECT COALESCE(ROUND(AVG(per_student_step)::numeric, 1), 0)::numeric
  INTO v_avg_step
  FROM (
    SELECT MAX(step_number) FILTER (WHERE status IN ('completed', 'active')) AS per_student_step
    FROM roadmap_progress
    WHERE student_id = ANY(v_student_ids)
    GROUP BY student_id
  ) s;

  SELECT COALESCE(SUM(COALESCE(brands_contacted, 0) + COALESCE(influencers_contacted, 0)), 0)::int
  INTO v_emails_sent
  FROM daily_reports
  WHERE student_id = ANY(v_student_ids)
    AND submitted_at IS NOT NULL;

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

-- ---------------------------------------------------------------------------
-- get_coach_milestones(p_coach_id, p_today, p_tech_setup_enabled) — Phase 51
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_milestones(
  p_coach_id              uuid,
  p_today                 date    DEFAULT CURRENT_DATE,
  p_tech_setup_enabled    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      uuid := (SELECT auth.uid());
  v_student_ids uuid[];
  v_milestones  jsonb;
BEGIN
  IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM p_coach_id THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(id) INTO v_student_ids
  FROM users
  WHERE role IN ('student', 'student_diy')
    AND status = 'active'
    AND coach_id = p_coach_id;

  IF v_student_ids IS NULL OR array_length(v_student_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('milestones', '[]'::jsonb, 'count', 0);
  END IF;

  WITH
  five_inf AS (
    SELECT
      ('milestone_5_influencers:' || rp.student_id::text) AS alert_key,
      rp.student_id AS student_id,
      u.name AS student_name,
      '5_influencers'::text AS milestone_type,
      NULL::uuid AS deal_id,
      rp.completed_at AS occurred_at
    FROM roadmap_progress rp
    JOIN users u ON u.id = rp.student_id
    WHERE rp.student_id = ANY(v_student_ids)
      AND rp.step_number = 11
      AND rp.status = 'completed'
      AND rp.completed_at IS NOT NULL
  ),
  brand_resp AS (
    SELECT
      ('milestone_brand_response:' || rp.student_id::text),
      rp.student_id, u.name, 'brand_response'::text, NULL::uuid, rp.completed_at
    FROM roadmap_progress rp
    JOIN users u ON u.id = rp.student_id
    WHERE rp.student_id = ANY(v_student_ids)
      AND rp.step_number = 13
      AND rp.status = 'completed'
      AND rp.completed_at IS NOT NULL
  ),
  closed_deals AS (
    SELECT
      ('milestone_closed_deal:' || d.student_id::text || ':' || d.id::text),
      d.student_id, u.name, 'closed_deal'::text, d.id AS deal_id, d.created_at AS occurred_at
    FROM deals d
    JOIN users u ON u.id = d.student_id
    WHERE d.student_id = ANY(v_student_ids)
  ),
  tech_setup AS (
    SELECT
      ('milestone_tech_setup:' || rp.student_id::text),
      rp.student_id, u.name, 'tech_setup'::text, NULL::uuid, rp.completed_at
    FROM roadmap_progress rp
    JOIN users u ON u.id = rp.student_id
    WHERE p_tech_setup_enabled = true
      AND rp.student_id = ANY(v_student_ids)
      AND rp.step_number = 0
      AND rp.status = 'completed'
      AND rp.completed_at IS NOT NULL
  ),
  all_events AS (
    SELECT * FROM five_inf
    UNION ALL SELECT * FROM brand_resp
    UNION ALL SELECT * FROM closed_deals
    UNION ALL SELECT * FROM tech_setup
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'student_id',     ae.student_id,
      'student_name',   ae.student_name,
      'milestone_type', ae.milestone_type,
      'alert_key',      ae.alert_key,
      'deal_id',        ae.deal_id,
      'occurred_at',    ae.occurred_at
    )
    ORDER BY ae.occurred_at DESC
  ), '[]'::jsonb)
  INTO v_milestones
  FROM all_events ae
  LEFT JOIN alert_dismissals ad
    ON ad.owner_id = p_coach_id
   AND ad.alert_key = ae.alert_key
  WHERE ad.alert_key IS NULL;

  RETURN jsonb_build_object(
    'milestones', v_milestones,
    'count',      jsonb_array_length(v_milestones)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- get_owner_analytics() — Phase 64 expanded version (24 leaderboard slots)
-- ---------------------------------------------------------------------------
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
  IF v_caller IS NOT NULL THEN
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

-- ---------------------------------------------------------------------------
-- get_platform_stats() — platform-wide KPIs
-- ---------------------------------------------------------------------------
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
  IF v_caller IS NOT NULL THEN
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

-- ---------------------------------------------------------------------------
-- get_leaderboard(p_period_start, p_top_n) — student leaderboard
-- ---------------------------------------------------------------------------
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
  IF v_caller IS NOT NULL THEN
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

-- ---------------------------------------------------------------------------
-- get_student_summary(p_student_id, p_period_start) — student KPI summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_summary(
  p_student_id   uuid,
  p_period_start date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
BEGIN
  IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM p_student_id THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'hours_worked', COALESCE((SELECT SUM(duration_minutes)::numeric / 60.0 FROM work_sessions WHERE student_id = p_student_id AND status = 'completed' AND date >= p_period_start), 0),
    'deals_closed', (SELECT COUNT(*) FROM deals WHERE student_id = p_student_id AND created_at >= p_period_start),
    'revenue',      COALESCE((SELECT SUM(revenue) FROM deals WHERE student_id = p_student_id AND created_at >= p_period_start), 0),
    'profit',       COALESCE((SELECT SUM(profit) FROM deals WHERE student_id = p_student_id AND created_at >= p_period_start), 0),
    'outreach',     COALESCE((SELECT SUM(COALESCE(brands_contacted,0) + COALESCE(influencers_contacted,0)) FROM daily_reports WHERE student_id = p_student_id AND submitted_at IS NOT NULL AND date >= p_period_start), 0),
    'reports_submitted', (SELECT COUNT(*) FROM daily_reports WHERE student_id = p_student_id AND submitted_at IS NOT NULL AND date >= p_period_start)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- get_tier_distribution() — student tier distribution
-- ---------------------------------------------------------------------------
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
  IF v_caller IS NOT NULL THEN
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

-- ---------------------------------------------------------------------------
-- get_coach_performance_summary() — coach performance overview
-- ---------------------------------------------------------------------------
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
  IF v_caller IS NOT NULL THEN
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

-- ============================================================================
-- SECTION 11: GRANTS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- Specific execute grants for analytics functions
GRANT EXECUTE ON FUNCTION public.week_start(date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.student_activity_status(uuid, date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_analytics(uuid, text, int, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_analytics(uuid, int, date, int, int, int, text, text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_dashboard(uuid, date, date) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_milestones(uuid, date, boolean) TO service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_owner_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_owner_analytics() TO service_role;

-- ============================================================================
-- DONE
-- ============================================================================
