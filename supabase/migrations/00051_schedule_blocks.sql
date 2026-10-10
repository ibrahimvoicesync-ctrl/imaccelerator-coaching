-- =============================================================================
-- Migration: 00051_schedule_blocks.sql
--
-- Feedback: students keep Google Calendar open in a second tab purely to plan
-- their daily work blocks. This adds a day planner to the Work Tracker: named
-- blocks placed on a daily timeline, each of which can start a timer session.
--
-- Times are stored as minutes after local midnight (start_minute) on a local
-- calendar date, not as timestamptz — a plan is "9:00 on my Tuesday" wherever
-- the student is, and the client already keys work_sessions by local date.
--
-- session_id links a block to the work session started from it, so the planner
-- can show the block as in progress / done. ON DELETE SET NULL keeps the block
-- if the session entry is deleted.
--
-- All reads/writes go through the service-role admin client in route handlers,
-- so RLS is defense-in-depth: students manage only their own rows; owners may
-- read all.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 240),
  session_id uuid REFERENCES public.work_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_minute + duration_minutes <= 1440)
);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_student_date
  ON public.schedule_blocks(student_id, date);

ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

-- Students manage only their own blocks.
DROP POLICY IF EXISTS schedule_blocks_self_all ON public.schedule_blocks;
CREATE POLICY schedule_blocks_self_all
  ON public.schedule_blocks
  FOR ALL
  USING (student_id = (select get_user_id()))
  WITH CHECK (student_id = (select get_user_id()));

-- Owners may read all (support/debugging).
DROP POLICY IF EXISTS schedule_blocks_owner_select ON public.schedule_blocks;
CREATE POLICY schedule_blocks_owner_select
  ON public.schedule_blocks
  FOR SELECT
  USING ((select get_user_role()) = 'owner');

COMMIT;
