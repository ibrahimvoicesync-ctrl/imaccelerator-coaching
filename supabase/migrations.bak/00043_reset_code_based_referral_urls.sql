-- =============================================================================
-- Migration: 00043_reset_code_based_referral_urls.sql
--
-- Quick task 260420-rbd registered Rebrandly short links using the 8-char
-- random referral_code as the slashtag (e.g. application.imaccelerator.com/75691E9F).
-- Quick task 260420-rbn switches to a human-readable slug of the student's
-- name (e.g. application.imaccelerator.com/ibrahim-awwad) with
-- utm_source=referral&utm_campaign=<slug> on the destination.
--
-- Null every users.referral_short_url that still matches the old code-based
-- format (exact "<REFERRAL_BASE_URL>/<referral_code>") so the next call to
-- /api/referral-link regenerates it under the new name-based scheme.
--
-- Idempotent: the WHERE filter matches nothing after the first successful run
-- (because every matching row is set to NULL, and NULL fails the equality
-- comparison).
-- Transactional: single BEGIN;...COMMIT;. ASSERT failure rolls back.
-- =============================================================================

BEGIN;

UPDATE public.users
   SET referral_short_url = NULL
 WHERE referral_short_url IS NOT NULL
   AND referral_code IS NOT NULL
   AND referral_short_url = 'https://application.imaccelerator.com/' || referral_code;

DO $mig43_assert$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining
    FROM public.users
   WHERE referral_short_url IS NOT NULL
     AND referral_code IS NOT NULL
     AND referral_short_url = 'https://application.imaccelerator.com/' || referral_code;
  ASSERT v_remaining = 0,
    format('Migration 00043: %s users still have a code-based application.imaccelerator.com URL after reset', v_remaining);
END $mig43_assert$;

COMMIT;
