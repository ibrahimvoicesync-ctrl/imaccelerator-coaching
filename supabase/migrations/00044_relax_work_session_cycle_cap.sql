-- =============================================================================
-- Migration: 00044_relax_work_session_cycle_cap.sql
--
-- Feedback: the 4-hour / 4-session daily cap is too rigid. Students who work in
-- longer blocks or want more than four sessions a day were blocked.
--
-- The original work_sessions table declared `cycle_number integer NOT NULL
-- CHECK (cycle_number BETWEEN 1 AND 4)`, which hard-caps a student to four
-- sessions per day at the database level. The app already supports "extra"
-- ad-hoc sessions once a plan is fulfilled (cycle_number can exceed 4), but
-- those inserts fail the CHECK constraint and surface as a generic
-- "Failed to start session" error.
--
-- Relax the constraint to only require cycle_number >= 1. The per-day daily cap
-- is now enforced in application code against the daily plan's
-- total_work_minutes (raised to dailyCapHours = 8h), and the unique index on
-- (student_id, date, cycle_number) still prevents duplicate slots.
--
-- Idempotent: DROP ... IF EXISTS + recreate. The auto-generated inline-check
-- name from the original CREATE TABLE is work_sessions_cycle_number_check.
-- Transactional: single BEGIN;...COMMIT;.
-- =============================================================================

BEGIN;

ALTER TABLE public.work_sessions
  DROP CONSTRAINT IF EXISTS work_sessions_cycle_number_check;

ALTER TABLE public.work_sessions
  ADD CONSTRAINT work_sessions_cycle_number_check CHECK (cycle_number >= 1);

COMMIT;
