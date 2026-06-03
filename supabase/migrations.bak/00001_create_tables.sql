-- ============================================================================
-- IMA Accelerator V1 — Database Migration
-- Creates V1 tables only (6 tables), helper functions, RLS policies, triggers
-- Uses (select get_user_role()) initplan wrapper pattern for RLS performance
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger function (no table references, needed by table triggers below)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 2. Tables (V1 only — NO V2 tables)
-- ---------------------------------------------------------------------------

-- users (streak_count and last_active_at removed from V1)
CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid UNIQUE,
  email varchar(255) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('owner', 'coach', 'student')),
  coach_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  niche varchar(255),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_coach_id ON public.users(coach_id);
CREATE INDEX idx_users_status ON public.users(status);
CREATE INDEX idx_users_auth_id ON public.users(auth_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- invites
CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('coach', 'student')),
  invited_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  code varchar(64) NOT NULL UNIQUE,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_email ON public.invites(email);
CREATE INDEX idx_invites_invited_by ON public.invites(invited_by);
CREATE INDEX idx_invites_coach_id ON public.invites(coach_id);

-- magic_links (V1 version from migration 00003 — standalone, not invite-tied)
CREATE TABLE public.magic_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('coach', 'student')),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  max_uses int,
  use_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_magic_links_created_by ON public.magic_links(created_by);

-- work_sessions
CREATE TABLE public.work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  cycle_number integer NOT NULL CHECK (cycle_number BETWEEN 1 AND 4),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  duration_minutes integer NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_sessions_student_date ON public.work_sessions(student_id, date);
CREATE UNIQUE INDEX idx_work_sessions_student_date_cycle ON public.work_sessions(student_id, date, cycle_number);
CREATE INDEX idx_work_sessions_student ON public.work_sessions(student_id);

-- roadmap_progress
CREATE TABLE public.roadmap_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  step_number integer NOT NULL CHECK (step_number BETWEEN 1 AND 10),
  step_name varchar(255) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'active', 'completed')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_roadmap_progress_student_step ON public.roadmap_progress(student_id, step_number);
CREATE INDEX idx_roadmap_progress_student ON public.roadmap_progress(student_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.roadmap_progress
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- daily_reports
CREATE TABLE public.daily_reports (
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
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_daily_reports_student_date ON public.daily_reports(student_id, date);
CREATE INDEX idx_daily_reports_date ON public.daily_reports(date);
CREATE INDEX idx_daily_reports_student ON public.daily_reports(student_id);

-- ---------------------------------------------------------------------------
-- 3. RLS Helper Functions (after tables they reference, before RLS policies)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 4. Enable Row Level Security on all 6 tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. RLS Policies — using (select get_user_role()) initplan wrapper
--    Wrapping in scalar subqueries forces Postgres to evaluate once per query
--    instead of per row (initplan evaluation = better performance).
-- ---------------------------------------------------------------------------

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
    (select get_user_role()) = 'student'
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
  USING ((select get_user_role()) = 'student' AND id = (select get_user_id()))
  WITH CHECK ((select get_user_role()) = 'student' AND id = (select get_user_id()));

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
  USING ((select get_user_role()) = 'student' AND student_id = (select get_user_id()));

CREATE POLICY "student_insert_work_sessions" ON public.work_sessions
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'student' AND student_id = (select get_user_id()));

CREATE POLICY "student_update_work_sessions" ON public.work_sessions
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'student' AND student_id = (select get_user_id()))
  WITH CHECK ((select get_user_role()) = 'student' AND student_id = (select get_user_id()));

CREATE POLICY "student_delete_work_sessions" ON public.work_sessions
  FOR DELETE TO authenticated
  USING ((select get_user_role()) = 'student' AND student_id = (select get_user_id()));

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
  USING ((select get_user_role()) = 'student' AND student_id = (select get_user_id()));

CREATE POLICY "student_update_roadmap" ON public.roadmap_progress
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'student' AND student_id = (select get_user_id()))
  WITH CHECK ((select get_user_role()) = 'student' AND student_id = (select get_user_id()));

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
  USING ((select get_user_role()) = 'student' AND student_id = (select get_user_id()));

CREATE POLICY "student_insert_reports" ON public.daily_reports
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'student' AND student_id = (select get_user_id()));

CREATE POLICY "student_update_reports" ON public.daily_reports
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'student' AND student_id = (select get_user_id()))
  WITH CHECK ((select get_user_role()) = 'student' AND student_id = (select get_user_id()));

-- ---------------------------------------------------------------------------
-- 6. Security Triggers
-- ---------------------------------------------------------------------------

-- Prevents non-owners from changing role, coach_id, auth_id, email, joined_at
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

CREATE TRIGGER enforce_self_update_users
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.restrict_self_update_users();

-- Coaches can only change reviewed_by and reviewed_at on daily_reports
CREATE OR REPLACE FUNCTION public.restrict_coach_report_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (select get_user_role()) = 'coach' THEN
    NEW.student_id     := OLD.student_id;
    NEW.date           := OLD.date;
    NEW.hours_worked   := OLD.hours_worked;
    NEW.star_rating    := OLD.star_rating;
    NEW.outreach_count := OLD.outreach_count;
    NEW.wins           := OLD.wins;
    NEW.improvements   := OLD.improvements;
    NEW.submitted_at   := OLD.submitted_at;
    NEW.created_at     := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_coach_report_fields
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION public.restrict_coach_report_update();

-- ---------------------------------------------------------------------------
-- 7. Grants — allow Supabase roles to access tables (RLS still enforces row access)
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
