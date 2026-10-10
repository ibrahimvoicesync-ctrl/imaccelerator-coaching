-- 00047: revenue & profit logging on the daily report
-- Students log the money they closed as part of their daily report (student
-- role only). Stored directly on daily_reports — a student-facing log; the
-- deals table and coach/owner revenue analytics are intentionally untouched.

ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS revenue numeric(12,2) NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  ADD COLUMN IF NOT EXISTS profit  numeric(12,2) NOT NULL DEFAULT 0 CHECK (profit  >= 0);
