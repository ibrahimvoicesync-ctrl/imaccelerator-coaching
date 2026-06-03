-- ============================================================================
-- Phase 45: deals.logged_by Migration + API + RLS
-- Migration: 00022_deals_logged_by.sql
--
-- Adds creator attribution and audit columns to public.deals, and the
-- two new RLS policies (coach_insert_deals, owner_insert_deals) that
-- form the second layer of the dual-layer authorization model
-- (route handler + RLS WITH CHECK) per DEALS-03.
--
-- Schema changes:
--   1. ADD COLUMN logged_by uuid REFERENCES users(id) ON DELETE SET NULL
--      Backfill: logged_by = student_id for every existing row.
--      Then ALTER COLUMN logged_by SET NOT NULL.
--   2. ADD COLUMN updated_by uuid REFERENCES users(id) ON DELETE SET NULL
--      (Nullable — historical rows have no recorded updater.)
--   3. CREATE OR REPLACE FUNCTION deals_set_audit() — BEFORE INSERT/UPDATE
--      trigger that sets updated_at = now() and updated_by from
--      current_setting('app.current_user_id', true)::uuid when present.
--      Replaces the existing handle_updated_at trigger on this table only.
--   4. Two new RLS policies:
--        coach_insert_deals  — coach can INSERT deals only for assigned students
--        owner_insert_deals  — owner can INSERT deals for any student
--      (Existing 8 policies are left untouched.)
--
-- Compatibility: existing student_insert_deals policy already gates
--   student inserts via student_id = (select get_user_id()); it stays.
--   The dual-layer model for coach/owner = route handler check (Task 2)
--   AND RLS WITH CHECK (this migration).
--
-- Requires: get_user_id(), get_user_role() from 00001_create_tables.sql
-- Requires: handle_updated_at() from 00001 (we DROP its TRIGGER on deals,
--   keep the function for other tables that still reference it).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Add logged_by column (NULL initially, backfill, then SET NOT NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS logged_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- Backfill: every historical row was inserted by the student themselves
-- (Phase 38 had no coach/owner insert path). logged_by = student_id is the
-- correct retroactive attribution.
UPDATE public.deals
   SET logged_by = student_id
 WHERE logged_by IS NULL;

-- Enforce NOT NULL after backfill. NEW inserts MUST supply logged_by.
ALTER TABLE public.deals
  ALTER COLUMN logged_by SET NOT NULL;


-- ---------------------------------------------------------------------------
-- 2. Add updated_by column (nullable — historical rows have no recorded updater)
-- ---------------------------------------------------------------------------
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL;


-- ---------------------------------------------------------------------------
-- 3. deals_set_audit() trigger function
--    BEFORE INSERT: sets updated_at = now() (always), updated_by =
--      current_setting('app.current_user_id', true)::uuid IF present, else NULL.
--    BEFORE UPDATE: sets updated_at = now() and updated_by from the same
--      session GUC. Caller (API route) sets the GUC via
--      `SELECT set_config('app.current_user_id', '<uuid>', true)` before
--      every write. The 3rd arg (true) makes it transaction-local so it
--      auto-resets at commit/rollback.
--
--    SECURITY DEFINER + search_path = public (PERF-04 convention).
--    Returns NEW (BEFORE-trigger contract).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deals_set_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
BEGIN
  v_actor := current_setting('app.current_user_id', true);

  -- Always stamp updated_at on every write.
  NEW.updated_at := now();

  -- Stamp updated_by if a session actor is set.
  IF v_actor IS NOT NULL AND v_actor <> '' THEN
    BEGIN
      NEW.updated_by := v_actor::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      -- Caller passed a non-uuid value — leave updated_by unchanged.
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.deals_set_audit() IS
  'Phase 45: stamps updated_at + updated_by on every deals INSERT/UPDATE. updated_by sourced from session GUC app.current_user_id set by the API route before writes.';


-- Drop the existing handle_updated_at trigger on deals (Phase 38) and replace
-- with deals_set_audit which covers both updated_at AND updated_by.
DROP TRIGGER IF EXISTS set_updated_at ON public.deals;
DROP TRIGGER IF EXISTS set_audit ON public.deals;

CREATE TRIGGER set_audit
  BEFORE INSERT OR UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_set_audit();


-- ---------------------------------------------------------------------------
-- 4. New RLS policies — dual-layer second leg
-- ---------------------------------------------------------------------------

-- Coach: INSERT deals only for students they are assigned to (DEALS-03 dual layer).
-- Initplan pattern: (select get_user_role()), (select get_user_id()).
DROP POLICY IF EXISTS coach_insert_deals ON public.deals;
CREATE POLICY coach_insert_deals ON public.deals
  FOR INSERT TO authenticated
  WITH CHECK (
    (select get_user_role()) = 'coach'
    AND student_id IN (
      SELECT id FROM public.users WHERE coach_id = (select get_user_id())
    )
    AND logged_by = (select get_user_id())
  );

-- Owner: INSERT deals for any student (DEALS-05). logged_by must = owner uuid.
DROP POLICY IF EXISTS owner_insert_deals ON public.deals;
CREATE POLICY owner_insert_deals ON public.deals
  FOR INSERT TO authenticated
  WITH CHECK (
    (select get_user_role()) = 'owner'
    AND logged_by = (select get_user_id())
  );


-- ---------------------------------------------------------------------------
-- 5. Verify composite unique index exists (created in Phase 38).
--    This phase does NOT create a duplicate — it asserts presence so the
--    plan's must_have remains true after this migration.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.deals'::regclass
       AND conname  = 'deals_student_deal_number_key'
  ) AND NOT EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'deals'
       AND indexdef ILIKE '%UNIQUE%student_id%deal_number%'
  ) THEN
    RAISE EXCEPTION
      'Expected composite UNIQUE on deals(student_id, deal_number); not found. '
      'Add it before this migration runs.';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 6. Embedded asserts (run at migration time)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_logged_by_nullable boolean;
  v_updated_by_nullable boolean;
  v_logged_by_fk text;
  v_policy_count integer;
BEGIN
  -- logged_by NOT NULL after backfill
  SELECT is_nullable = 'YES' INTO v_logged_by_nullable
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='deals' AND column_name='logged_by';
  ASSERT v_logged_by_nullable = false,
    'deals.logged_by must be NOT NULL after backfill';

  -- updated_by EXISTS and is nullable
  SELECT is_nullable = 'YES' INTO v_updated_by_nullable
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='deals' AND column_name='updated_by';
  ASSERT v_updated_by_nullable = true,
    'deals.updated_by must be nullable';

  -- logged_by FK targets users(id) with ON DELETE SET NULL
  SELECT confdeltype::text INTO v_logged_by_fk
    FROM pg_constraint
   WHERE conrelid='public.deals'::regclass
     AND conkey  = ARRAY[(
       SELECT attnum FROM pg_attribute
        WHERE attrelid='public.deals'::regclass AND attname='logged_by'
     )::smallint];
  ASSERT v_logged_by_fk = 'n',
    format('deals.logged_by ON DELETE must be SET NULL (n), got %s', v_logged_by_fk);

  -- coach_insert_deals + owner_insert_deals exist
  SELECT count(*) INTO v_policy_count
    FROM pg_policies
   WHERE schemaname='public' AND tablename='deals'
     AND policyname IN ('coach_insert_deals', 'owner_insert_deals');
  ASSERT v_policy_count = 2,
    format('Expected 2 new INSERT policies (coach + owner); found %s', v_policy_count);
END $$;
