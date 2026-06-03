-- =============================================================================
-- Migration: 00041_reset_rebrandly_short_urls.sql
--
-- The referral short-link API no longer synthesizes links via Rebrandly. Every
-- student with a cached https://rebrand.ly/* value in users.referral_short_url
-- must be reset to NULL so the next call to /api/referral-link recomputes the
-- value as https://application.imaccelerator.com/<referral_code>.
--
-- Idempotent: the WHERE filter matches nothing after the first successful run.
-- Transactional: single BEGIN;...COMMIT;. ASSERT failure rolls back.
-- =============================================================================

BEGIN;

UPDATE public.users
   SET referral_short_url = NULL
 WHERE referral_short_url LIKE 'https://rebrand.ly/%';

DO $mig41_assert$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining
    FROM public.users
   WHERE referral_short_url LIKE 'https://rebrand.ly/%';
  ASSERT v_remaining = 0,
    format('Migration 00041: %s users still have a https://rebrand.ly/* URL after reset', v_remaining);
END $mig41_assert$;

COMMIT;
