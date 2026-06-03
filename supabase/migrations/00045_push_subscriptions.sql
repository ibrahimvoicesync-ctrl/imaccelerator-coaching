-- =============================================================================
-- Migration: 00045_push_subscriptions.sql
--
-- Feedback: nothing pulls students back after initial use. This adds the
-- storage for Web Push subscriptions so the platform can send an opt-in daily
-- reminder (paired with the in-app consistency streak).
--
-- One row per browser/device push subscription. A student may have several
-- (phone + laptop). `endpoint` is globally unique per the Web Push spec and is
-- how we de-duplicate and target a subscription. p256dh + auth are the client
-- keys required to encrypt the push payload (RFC 8291).
--
-- All reads/writes go through the service-role admin client in route handlers,
-- so RLS is defense-in-depth: students may manage only their own rows; owners
-- may read all for support/debugging.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_student
  ON public.push_subscriptions(student_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Students manage only their own subscriptions.
DROP POLICY IF EXISTS push_subscriptions_self_all ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self_all
  ON public.push_subscriptions
  FOR ALL
  USING (student_id = (select get_user_id()))
  WITH CHECK (student_id = (select get_user_id()));

-- Owners may read all (support/debugging).
DROP POLICY IF EXISTS push_subscriptions_owner_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_owner_select
  ON public.push_subscriptions
  FOR SELECT
  USING ((select get_user_role()) = 'owner');

COMMIT;
