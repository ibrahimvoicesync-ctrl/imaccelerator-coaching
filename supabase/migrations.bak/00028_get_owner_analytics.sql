-- ============================================================================
-- Phase 54: Owner Analytics — batch RPC (lifetime top-3 leaderboards)
-- Migration: 00028_get_owner_analytics.sql
--
-- Creates: public.get_owner_analytics() RETURNS jsonb SECURITY DEFINER STABLE
--
-- Returns one envelope:
--   {
--     "leaderboards": {
--       "hours_alltime":  [{rank, student_id, student_name, minutes,      metric_display}, ...],
--       "profit_alltime": [{rank, student_id, student_name, profit_cents, metric_display}, ...],
--       "deals_alltime":  [{rank, student_id, student_name, deals,        metric_display}, ...]
--     }
--   }
--
-- Each leaderboard returns 0-3 rows (top-3 only). Deterministic tie-break:
--   ORDER BY <metric> DESC, LOWER(student_name) ASC, student_id::text ASC
-- (Locked decision D-01 in 54-CONTEXT.md — case-insensitive name sort matches
-- the Phase 48 coach analytics precedent.)
--
-- Authorization: copies the Phase 48 pattern exactly. If
-- (SELECT auth.uid()) IS NOT NULL we raise 'not_authorized' — there is no
-- authenticated owner-id param, so ANY authenticated caller is rejected. Only
-- the Next.js server-side admin client (auth.uid() IS NULL) may invoke this.
--
-- Depends on:
--   - idx_deals_student_created                      (Phase 44)
--   - idx_work_sessions_completed_student_date       (Phase 44)
--   - deals.profit NUMERIC                           (Phase 44)
--   - work_sessions.duration_minutes NULLABLE INT    (Phase 44)
--   Indexes already exist; do NOT re-declare here.
--
-- Cache layer: Next.js unstable_cache (60s TTL, tag `owner-analytics`, GLOBAL
-- — no per-user suffix because there is a single owner). The wrapper lives in
-- src/lib/rpc/owner-analytics.ts (Plan 02). Mutations invalidate via
-- revalidateTag("owner-analytics", "default") from the four mutation routes
-- wired in Plan 04.
--
-- metric_display formatting (performed server-side so both surfaces agree):
--   hours:  "147.5 h"      -- minutes / 60 rounded to 1 decimal, trailing " h"
--   profit: "$12,450"      -- cents converted to dollars, thousands separator,
--                             integer (no decimals — owner sees rounded totals)
--   deals:  "23"           -- integer count
-- ============================================================================

-- Idempotency: drop any existing overload to avoid "function already exists"
-- on remote pushes where a draft may linger (pattern from 00025).
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_owner_analytics'
  LOOP
    EXECUTE format('DROP FUNCTION public.get_owner_analytics(%s) CASCADE', r.args);
  END LOOP;
END $drop$;

CREATE OR REPLACE FUNCTION public.get_owner_analytics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid := (SELECT auth.uid());
  v_leaderboards jsonb;
BEGIN
  -- 1. Authorization guard. The service-role admin client has auth.uid() IS
  --    NULL and is allowed. ANY authenticated caller is rejected because this
  --    endpoint is owner-only and the route handler has already validated the
  --    owner role before invoking the admin client.
  IF v_caller IS NOT NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- 2. Build the three leaderboards in one CTE chain. Every list limits to 3.
  --    ORDER BY metric DESC, LOWER(student_name) ASC, student_id::text ASC
  --    per D-01 — deterministic tie-break so the teaser and full page never
  --    disagree and cache-window repeat renders are identical.
  --
  --    Only students with role IN ('student', 'student_diy') participate.
  --    status = 'active' filtering is intentionally NOT applied: the owner
  --    wants lifetime leaderboards, and inactive-status students still count
  --    for their historical work.
  WITH
  hours_rows AS (
    SELECT
      u.id       AS student_id,
      u.name     AS student_name,
      COALESCE(SUM(ws.duration_minutes), 0)::bigint AS minutes
    FROM users u
    LEFT JOIN work_sessions ws
      ON ws.student_id = u.id
     AND ws.status = 'completed'
    WHERE u.role IN ('student', 'student_diy')
    GROUP BY u.id, u.name
    HAVING COALESCE(SUM(ws.duration_minutes), 0) > 0
  ),
  hours_ranked AS (
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY minutes DESC, LOWER(student_name) ASC, student_id::text ASC
      )::int AS rank,
      student_id,
      student_name,
      minutes
    FROM hours_rows
  ),
  profit_rows AS (
    SELECT
      u.id   AS student_id,
      u.name AS student_name,
      COALESCE(SUM(d.profit), 0)::numeric AS profit
    FROM users u
    LEFT JOIN deals d ON d.student_id = u.id
    WHERE u.role IN ('student', 'student_diy')
    GROUP BY u.id, u.name
    HAVING COALESCE(SUM(d.profit), 0) > 0
  ),
  profit_ranked AS (
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY profit DESC, LOWER(student_name) ASC, student_id::text ASC
      )::int AS rank,
      student_id,
      student_name,
      profit
    FROM profit_rows
  ),
  deals_rows AS (
    SELECT
      u.id   AS student_id,
      u.name AS student_name,
      COUNT(d.id)::int AS deals
    FROM users u
    LEFT JOIN deals d ON d.student_id = u.id
    WHERE u.role IN ('student', 'student_diy')
    GROUP BY u.id, u.name
    HAVING COUNT(d.id) > 0
  ),
  deals_ranked AS (
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY deals DESC, LOWER(student_name) ASC, student_id::text ASC
      )::int AS rank,
      student_id,
      student_name,
      deals
    FROM deals_rows
  )
  SELECT jsonb_build_object(
    'hours_alltime', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'rank',           rank,
          'student_id',     student_id,
          'student_name',   student_name,
          'minutes',        minutes,
          'metric_display', to_char(ROUND((minutes::numeric / 60.0)::numeric, 1), 'FM999G999G990D0') || ' h'
        ) ORDER BY rank
      )
      FROM hours_ranked
      WHERE rank <= 3
    ), '[]'::jsonb),
    'profit_alltime', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'rank',           rank,
          'student_id',     student_id,
          'student_name',   student_name,
          'profit',         profit,
          'metric_display', '$' || to_char(ROUND(profit, 0), 'FM999G999G999G990')
        ) ORDER BY rank
      )
      FROM profit_ranked
      WHERE rank <= 3
    ), '[]'::jsonb),
    'deals_alltime', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'rank',           rank,
          'student_id',     student_id,
          'student_name',   student_name,
          'deals',          deals,
          'metric_display', deals::text
        ) ORDER BY rank
      )
      FROM deals_ranked
      WHERE rank <= 3
    ), '[]'::jsonb)
  )
  INTO v_leaderboards;

  RETURN jsonb_build_object('leaderboards', v_leaderboards);
END;
$$;

-- Grant execute to the service_role only (admin client). No anon/authenticated
-- grant — the authorization guard above rejects them anyway, but we tighten
-- the grant as defense in depth.
REVOKE EXECUTE ON FUNCTION public.get_owner_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_owner_analytics() TO service_role;
