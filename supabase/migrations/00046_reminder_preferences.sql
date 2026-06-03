-- =============================================================================
-- Migration: 00046_reminder_preferences.sql
--
-- Per-student daily-reminder time. Previously the push reminder fired at a
-- single fixed hour for everyone (17:00 UTC via Vercel Cron). Each student now
-- chooses their own hour.
--
-- We store the student's chosen LOCAL hour plus the browser's UTC offset
-- (minutes, as returned by Date.getTimezoneOffset()) captured when they set it.
-- The hourly reminder job converts "now" into each student's local hour and
-- sends when it matches reminder_hour. Storing the offset (instead of a single
-- pre-converted UTC hour) keeps the comparison correct across timezones.
--
-- Defaults reproduce the old behaviour for existing rows: 17:00 at offset 0
-- (i.e. 17:00 UTC) until the student picks a time.
-- =============================================================================

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS reminder_hour smallint NOT NULL DEFAULT 17
    CHECK (reminder_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS reminder_offset_min integer NOT NULL DEFAULT 0
    CHECK (reminder_offset_min BETWEEN -840 AND 840);

COMMIT;
