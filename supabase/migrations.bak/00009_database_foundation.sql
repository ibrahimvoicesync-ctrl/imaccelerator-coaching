-- ============================================================================
-- Phase 19: Database Foundation
-- Composite indexes for hot query paths + pg_stat_statements monitoring
-- All CREATE INDEX use IF NOT EXISTS for idempotency (per D-10)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Composite index: work_sessions(student_id, date, status)
--    Satisfies DB-01. Covers queries that filter by status
--    (e.g., in_progress sessions on work tracker page).
--    The existing idx_work_sessions_student_date covers (student_id, date);
--    this adds status coverage for the 3-column filter pattern.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_work_sessions_student_date_status
  ON public.work_sessions(student_id, date, status);

-- ---------------------------------------------------------------------------
-- 2. Confirm roadmap_progress(student_id) coverage.
--    idx_roadmap_progress_student already exists from migration 00001.
--    This CREATE INDEX IF NOT EXISTS is a no-op that documents the intent
--    and satisfies the DB-01 requirement traceability.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_roadmap_progress_student
  ON public.roadmap_progress(student_id);

-- ---------------------------------------------------------------------------
-- 3. Confirm daily_reports(student_id, date) coverage.
--    idx_daily_reports_student_date already exists as UNIQUE from 00001.
--    Documenting as no-op for DB-01 traceability.
-- ---------------------------------------------------------------------------
-- No action needed: idx_daily_reports_student_date (UNIQUE) already covers this.

-- ---------------------------------------------------------------------------
-- 4. Enable pg_stat_statements extension (DB-04).
--    On Supabase hosted, this is typically enabled via Dashboard.
--    Including here for local dev and as documentation anchor.
--    The extension lives in the 'extensions' schema on Supabase.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA extensions;
