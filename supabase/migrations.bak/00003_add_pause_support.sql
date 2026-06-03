-- Add pause support to work_sessions table
-- Adds paused_at column and extends status CHECK to include 'paused'

ALTER TABLE public.work_sessions
  ADD COLUMN paused_at timestamptz;

-- Drop existing status CHECK constraint
ALTER TABLE public.work_sessions
  DROP CONSTRAINT work_sessions_status_check;

-- Re-add with 'paused' included
ALTER TABLE public.work_sessions
  ADD CONSTRAINT work_sessions_status_check
  CHECK (status IN ('in_progress', 'completed', 'abandoned', 'paused'));
