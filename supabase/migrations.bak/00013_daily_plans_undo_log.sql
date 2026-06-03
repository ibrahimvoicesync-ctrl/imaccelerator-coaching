-- ============================================================================
-- Phase 26: Database Schema Foundation
-- Migration: 00013_daily_plans_undo_log.sql
--
-- Creates daily_plans and roadmap_undo_log tables with indexes, RLS, and
-- policies. Unblocks v1.3 API work (Phases 27-29).
--
-- daily_plans: one plan per student per day, plan_json stores session configs.
--   Note: plan_json must include { version: 1, ... } — enforced at application
--   layer via Zod safeParse (Phase 28). Date uses DEFAULT CURRENT_DATE;
--   Supabase runs UTC. Application must use getTodayUTC() for date values.
--
-- roadmap_undo_log: append-only audit log of undo actions by coach/owner.
--   No UPDATE or DELETE RLS policies — append-only per D-03.
-- ============================================================================


-- ============================================================================
-- Section 1: daily_plans table
-- ============================================================================

CREATE TABLE public.daily_plans (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date       date        NOT NULL DEFAULT CURRENT_DATE,
  plan_json  jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================================
-- Section 2: daily_plans indexes
--
-- UNIQUE index on (student_id, date): enforces one-plan-per-student-per-day
-- and serves the hot query path for Phase 28 GET /api/daily-plans endpoint.
-- ============================================================================

CREATE UNIQUE INDEX idx_daily_plans_student_date ON public.daily_plans(student_id, date);


-- ============================================================================
-- Section 3: roadmap_undo_log table
--
-- actor_role uses text + CHECK consistent with users.role and magic_links.role
-- patterns in this schema. actor_id = the coach/owner who performed the undo.
-- student_id = the student whose roadmap step was reverted.
-- step_number matches roadmap_progress.step_number type (integer).
-- undone_at used instead of created_at (per ROADMAP.md Phase 26 criteria).
-- ============================================================================

CREATE TABLE public.roadmap_undo_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_role  text        NOT NULL CHECK (actor_role IN ('coach', 'owner')),
  student_id  uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  step_number integer     NOT NULL,
  undone_at   timestamptz NOT NULL DEFAULT now()
);


-- ============================================================================
-- Section 4: roadmap_undo_log indexes
--
-- Index on student_id supports Phase 27 "all undo events for student X" queries.
-- ============================================================================

CREATE INDEX idx_roadmap_undo_log_student ON public.roadmap_undo_log(student_id);


-- ============================================================================
-- Section 5: Enable RLS on both tables
-- ============================================================================

ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_undo_log ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- Section 6: RLS policies — daily_plans
--
-- Students: INSERT and SELECT own rows only.
-- Coaches: SELECT rows for their assigned students (needed for coach visibility).
-- Owners: SELECT all rows.
-- No UPDATE or DELETE policies — plans are write-once; Phase 28 handles
-- idempotent conflict at the API level (return existing plan on duplicate date).
-- ============================================================================

CREATE POLICY "student_select_daily_plans" ON public.daily_plans
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'student' AND student_id = (select get_user_id()));

CREATE POLICY "student_insert_daily_plans" ON public.daily_plans
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'student' AND student_id = (select get_user_id()));

CREATE POLICY "coach_select_daily_plans" ON public.daily_plans
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND student_id IN (SELECT id FROM public.users WHERE coach_id = (select get_user_id()))
  );

CREATE POLICY "owner_select_daily_plans" ON public.daily_plans
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');


-- ============================================================================
-- Section 7: RLS policies — roadmap_undo_log
--
-- Coaches: INSERT (must be their own actor_id) and SELECT own rows.
-- Owners: INSERT and SELECT all rows.
-- No UPDATE or DELETE policies — append-only per D-03.
-- ============================================================================

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
