-- ============================================================================
-- Hotfix: Drop orphaned 4-arg get_sidebar_badges overload
-- Migration: 00032_drop_get_sidebar_badges_legacy_4arg.sql
--
-- ROOT CAUSE
-- ----------
-- Migration 00027 (Phase 51) DROPped the original 2-arg signature and created
-- a 4-arg version (uuid, text, date, boolean) for v1.5 milestone + tech_setup
-- notification logic.
--
-- Migration 00029 (Phase 55, chat removal) then used:
--     CREATE OR REPLACE FUNCTION public.get_sidebar_badges(p_user_id uuid, p_role text)
-- which Postgres treats as a NEW signature (overload identity = full type list),
-- so it created a fresh 2-arg function ALONGSIDE the existing 4-arg one rather
-- than replacing it.
--
-- The result: two coexisting overloads. The dashboard layout calls
--     supabase.rpc("get_sidebar_badges", { p_user_id, p_role })
-- using NAMED args. Both overloads accept those names (the 4-arg one defaults
-- p_today and p_tech_setup_enabled), so PostgREST raises PGRST203 and refuses
-- to dispatch:
--     "Could not choose the best candidate function between:
--      public.get_sidebar_badges(uuid, text),
--      public.get_sidebar_badges(uuid, text, date, boolean)"
--
-- WHY DROP THE 4-ARG (NOT THE 2-ARG)
-- ----------------------------------
-- 1. The 4-arg body still references the public.messages table, which 00029
--    DROPped CASCADE. So the 4-arg function is already broken at runtime — any
--    'coach' or 'student' role call would raise "relation messages does not
--    exist". It is dead code.
-- 2. The 2-arg version from 00029 is the current authoritative implementation
--    (chat-removed, announcement-aware) and is what the layout caller expects.
-- 3. The Phase 51 milestone payload is still delivered via the separate
--    public.get_coach_milestones(uuid, date, boolean) function, which is
--    invoked directly from src/lib/rpc/coach-milestones.ts — independent of
--    get_sidebar_badges. Dropping the 4-arg overload does not regress
--    milestone delivery.
--
-- IDEMPOTENT
-- ----------
-- DROP FUNCTION IF EXISTS — safe to re-run, safe on environments where the
-- orphan never existed (e.g. fresh local DBs from a clean migration replay,
-- though those will hit the same dual-create path and end up here too).
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_sidebar_badges(uuid, text, date, boolean);

COMMIT;
