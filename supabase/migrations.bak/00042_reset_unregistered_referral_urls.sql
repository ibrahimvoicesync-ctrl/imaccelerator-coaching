-- =============================================================================
-- Migration: 00042_reset_unregistered_referral_urls.sql
--
-- Quick task 260420-rbl emitted https://application.imaccelerator.com/<code>
-- URLs directly from /api/referral-link without registering the slashtag in
-- Rebrandly. Because application.imaccelerator.com is a Rebrandly branded
-- domain, those URLs 404 until a matching slashtag exists in the workspace.
--
-- This migration nulls every users.referral_short_url value that currently
-- points at the branded subdomain. The next call to /api/referral-link will
-- re-register the slashtag via Rebrandly (quick task 260420-rbd) and persist
-- the working URL.
--
-- Idempotent: the WHERE filter matches nothing after the first successful run.
-- Transactional: single BEGIN;...COMMIT;. ASSERT failure rolls back.
-- =============================================================================

BEGIN;

UPDATE public.users
   SET referral_short_url = NULL
 WHERE referral_short_url LIKE 'https://application.imaccelerator.com/%';

DO $mig42_assert$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining
    FROM public.users
   WHERE referral_short_url LIKE 'https://application.imaccelerator.com/%';
  ASSERT v_remaining = 0,
    format('Migration 00042: %s users still have an unregistered application.imaccelerator.com URL after reset', v_remaining);
END $mig42_assert$;

COMMIT;
