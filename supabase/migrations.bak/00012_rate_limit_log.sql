-- ============================================================================
-- Phase 22: Spike Protection & Rate Limiting
-- Migration: 00012_rate_limit_log.sql
--
-- Creates rate_limit_log table for DB-backed per-user rate limiting.
-- All API mutation routes call checkRateLimit() (src/lib/rate-limit.ts)
-- which COUNT-queries and INSERT-logs against this table.
-- Only accessed via service_role (admin client) — no JWT RLS policies needed.
-- ============================================================================


-- ============================================================================
-- Section 1: rate_limit_log table
-- ============================================================================

CREATE TABLE public.rate_limit_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  called_at   timestamptz NOT NULL DEFAULT now()
);


-- ============================================================================
-- Section 2: Covering index — all three WHERE/ORDER columns
-- ============================================================================

CREATE INDEX idx_rate_limit_user_endpoint_time
  ON public.rate_limit_log(user_id, endpoint, called_at DESC);


-- ============================================================================
-- Section 3: Enable RLS — no policies
--
-- service_role bypasses RLS entirely; no JWT access to this table.
-- The table is only ever read/written by the admin client (service_role key).
-- ============================================================================

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- Section 4: pg_cron cleanup job registration
--
-- Idempotent: unschedule any existing job with this name before scheduling.
-- Schedule: 30 3 * * * = 3:30 AM UTC
-- Retention: 2 hours (far longer than the 1-minute rate-limit window)
-- cron job name: cleanup-rate-limit-log (unique — does not conflict with
--   refresh-student-kpi-summaries registered in 00011_write_path.sql)
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('cleanup-rate-limit-log');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END; $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule(
      'cleanup-rate-limit-log',
      '30 3 * * *',
      'DELETE FROM public.rate_limit_log WHERE called_at < now() - interval ''2 hours'''
    );
  ELSE
    RAISE NOTICE 'pg_cron not available — skipping rate_limit_log cleanup job (OK for local dev)';
  END IF;
END; $$;
