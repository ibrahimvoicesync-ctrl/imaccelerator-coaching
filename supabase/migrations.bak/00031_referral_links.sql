-- =============================================================================
-- Phase 58: Schema & Backfill — Rebrandly referral columns on public.users
-- Migration: 00031_referral_links.sql
--
-- Closes DB-01, DB-02, DB-03.
--
-- Adds two nullable columns to public.users, backfills referral_code for every
-- existing student / student_diy row using upper(substr(md5(id::text), 1, 8)),
-- and enforces uniqueness via a partial UNIQUE index.
--
-- Idempotent: re-running on the same DB is a no-op (IF NOT EXISTS on columns
-- and index; backfill guarded by referral_code IS NULL).
--
-- Transactional: single BEGIN;...COMMIT;. Any ASSERT failure rolls back.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Section 1: Add columns (both nullable — owners/coaches stay NULL forever;
-- students/student_diy get referral_code filled by backfill below;
-- referral_short_url stays NULL until Phase 59 populates it per user).
-- -----------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code      varchar(12),
  ADD COLUMN IF NOT EXISTS referral_short_url text;

-- Optional documentation — visible in psql \d+ public.users
COMMENT ON COLUMN public.users.referral_code IS
  'Phase 58: per-user referral short code. 8 hex chars (UPPER) today, derived from upper(substr(md5(id::text), 1, 8)) for pre-existing students; Phase 59 generates codes for any subsequent role additions. varchar(12) leaves 4 chars of headroom.';
COMMENT ON COLUMN public.users.referral_short_url IS
  'Phase 58/59: cached Rebrandly short URL. NULL = not yet generated. Persisted on first successful /api/referral-link call for life.';

-- -----------------------------------------------------------------------------
-- Section 2: Backfill existing student + student_diy rows.
-- Deterministic expression per DB-02. Idempotency guard via referral_code IS NULL.
-- -----------------------------------------------------------------------------

UPDATE public.users
   SET referral_code = upper(substr(md5(id::text), 1, 8))
 WHERE role IN ('student', 'student_diy')
   AND referral_code IS NULL;

-- -----------------------------------------------------------------------------
-- Section 3: Partial UNIQUE index — collisions surface at write time (DB-03).
-- Pattern: precedent at 00015:62 (idx_messages_recipient_read WHERE read_at IS NULL).
-- -----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code
  ON public.users (referral_code)
  WHERE referral_code IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Section 4: Embedded ASSERT block — verifies every DB success criterion.
-- Failure raises an exception → Postgres rolls back → zero db state change.
-- -----------------------------------------------------------------------------

DO $phase58_assert$
DECLARE
  v_code_nullable        boolean;
  v_url_nullable         boolean;
  v_code_max_len         integer;
  v_unbackfilled         integer;
  v_owner_coach_polluted integer;
  v_backfill_mismatch    integer;
  v_unique_index_exists  integer;
BEGIN
  -- ASSERT 1a: referral_code exists and is nullable.
  SELECT is_nullable = 'YES',
         character_maximum_length
    INTO v_code_nullable, v_code_max_len
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='users' AND column_name='referral_code';
  ASSERT v_code_nullable = true,
    'referral_code must be nullable';
  ASSERT v_code_max_len = 12,
    format('referral_code must be varchar(12), got varchar(%s)', v_code_max_len);

  -- ASSERT 1b: referral_short_url exists and is nullable.
  SELECT is_nullable = 'YES' INTO v_url_nullable
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='users' AND column_name='referral_short_url';
  ASSERT v_url_nullable = true,
    'referral_short_url must be nullable';

  -- ASSERT 2a: every pre-existing student / student_diy row has non-null code.
  SELECT count(*) INTO v_unbackfilled
    FROM public.users
   WHERE role IN ('student', 'student_diy')
     AND referral_code IS NULL;
  ASSERT v_unbackfilled = 0,
    format('Phase 58 ASSERT 2a: %s student/student_diy rows missing referral_code post-backfill', v_unbackfilled);

  -- ASSERT 2b: no owner / coach row was given a code.
  SELECT count(*) INTO v_owner_coach_polluted
    FROM public.users
   WHERE role IN ('owner', 'coach')
     AND referral_code IS NOT NULL;
  ASSERT v_owner_coach_polluted = 0,
    format('Phase 58 ASSERT 2b: %s owner/coach rows incorrectly have referral_code set', v_owner_coach_polluted);

  -- ASSERT 2c: every backfilled code matches the deterministic expression.
  SELECT count(*) INTO v_backfill_mismatch
    FROM public.users
   WHERE role IN ('student', 'student_diy')
     AND referral_code IS NOT NULL
     AND referral_code <> upper(substr(md5(id::text), 1, 8));
  ASSERT v_backfill_mismatch = 0,
    format('Phase 58 ASSERT 2c: %s rows have referral_code that does not match upper(substr(md5(id::text), 1, 8))', v_backfill_mismatch);

  -- ASSERT 3: the partial UNIQUE index exists.
  SELECT count(*) INTO v_unique_index_exists
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename  = 'users'
     AND indexname  = 'idx_users_referral_code';
  ASSERT v_unique_index_exists = 1,
    'Phase 58 ASSERT 3: partial UNIQUE index idx_users_referral_code is missing';
END $phase58_assert$;

COMMIT;
