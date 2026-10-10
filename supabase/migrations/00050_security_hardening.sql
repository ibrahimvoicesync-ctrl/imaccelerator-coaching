-- =============================================================================
-- 00050 — Security hardening.
--
-- Closes the findings from the 2026-07-23 security scan that 00049 left open.
-- 00049 hardened nine RPCs and revoked EXECUTE from anon/authenticated, but it
-- never revoked the DEFAULT grant to PUBLIC, which anon/authenticated inherit —
-- so every SECURITY DEFINER RPC stayed reachable by an anonymous PostgREST
-- caller. Five more RPCs also kept the fail-open `v_caller IS NOT NULL` guard,
-- and two had no guard at all.
--
-- PART 1 — Bound the attacker-writable counter columns (fixes the int4 overflow
--          DoS against owner analytics and coach dashboards).
-- PART 2 — Replace the fail-open guards; add the missing ones; widen the
--          per-row int4 additions to bigint.
-- PART 3 — Revoke EXECUTE from PUBLIC (the grant 00049 missed), then re-grant
--          only the two helpers RLS policies actually call.
--
-- Verified before writing: no extension-owned functions live in schema public
-- (all 26 routines are app-owned), and no column default, CHECK constraint, or
-- index expression calls a public function — so the PART 3 revoke cannot break
-- inserts or policy evaluation. RLS policies call only get_user_id() and
-- get_user_role(), both re-granted below.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1 — Bound the counter columns.
--
-- brands_contacted / influencers_contacted are plain integer columns with no
-- bound that a student may write directly over PostgREST (the app route's Zod
-- max of 500 is not enforced at the database). Setting one to 2147483647 made
-- the int4 addition inside the analytics RPCs overflow, raising SQLSTATE 22003
-- and breaking /owner/analytics platform-wide and /coach for the student's
-- coach. Bounding the input is the root-cause fix; the bigint widening in
-- PART 2 is defense in depth.
--
-- Current maxima at time of writing: brands 50, influencers 90, calls 1,
-- outreach 140, duration_minutes 120 — all validate cleanly.
-- =============================================================================

ALTER TABLE public.daily_reports DROP CONSTRAINT IF EXISTS daily_reports_brands_contacted_bounded;
ALTER TABLE public.daily_reports ADD  CONSTRAINT daily_reports_brands_contacted_bounded
  CHECK (brands_contacted BETWEEN 0 AND 100000);

ALTER TABLE public.daily_reports DROP CONSTRAINT IF EXISTS daily_reports_influencers_contacted_bounded;
ALTER TABLE public.daily_reports ADD  CONSTRAINT daily_reports_influencers_contacted_bounded
  CHECK (influencers_contacted BETWEEN 0 AND 100000);

ALTER TABLE public.daily_reports DROP CONSTRAINT IF EXISTS daily_reports_calls_joined_bounded;
ALTER TABLE public.daily_reports ADD  CONSTRAINT daily_reports_calls_joined_bounded
  CHECK (calls_joined BETWEEN 0 AND 10000);

ALTER TABLE public.daily_reports DROP CONSTRAINT IF EXISTS daily_reports_outreach_count_bounded;
ALTER TABLE public.daily_reports ADD  CONSTRAINT daily_reports_outreach_count_bounded
  CHECK (outreach_count BETWEEN 0 AND 1000000);

ALTER TABLE public.work_sessions DROP CONSTRAINT IF EXISTS work_sessions_duration_minutes_bounded;
ALTER TABLE public.work_sessions ADD  CONSTRAINT work_sessions_duration_minutes_bounded
  CHECK (duration_minutes BETWEEN 0 AND 100000);

ALTER TABLE public.work_sessions DROP CONSTRAINT IF EXISTS work_sessions_session_minutes_bounded;
ALTER TABLE public.work_sessions ADD  CONSTRAINT work_sessions_session_minutes_bounded
  CHECK (session_minutes BETWEEN 0 AND 100000);

-- =============================================================================
-- PART 2 — Harden the in-function guards (defense in depth).
--
-- The old guard was:
--
--   IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM p_student_id THEN
--
-- For an anonymous PostgREST request auth.uid() is NULL, so `v_caller IS NOT
-- NULL` is false and the guard never fires — it failed OPEN for exactly the
-- caller it needed to stop. (It was also type-confused: auth.uid() is
-- users.auth_id while p_student_id is users.id, so it could never pass for a
-- real session either.) Every app caller reaches these RPCs through the
-- service-role admin client, so requiring service_role costs nothing.
--
-- Bodies below are taken verbatim from the deployed definitions
-- (pg_get_functiondef) with only the guard, the array bound, and the int4->
-- bigint widening changed, so they cannot drift from what is live.
-- =============================================================================

-- get_student_analytics: guard replaced, unused v_caller removed
CREATE OR REPLACE FUNCTION public.get_student_analytics(p_student_id uuid, p_range text DEFAULT 'daily'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start_date       date;
  v_today            date := CURRENT_DATE;
  v_bucket_mode      text;
  v_totals           jsonb;
  v_streak           int := 0;
  v_outreach_trend   jsonb;
  v_hours_trend      jsonb;
  v_deals            jsonb;
  v_deal_summary     jsonb;
  v_roadmap          jsonb;
  v_total_deal_count int;
  v_offset           int;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_range NOT IN ('daily','weekly','monthly') THEN
    RAISE EXCEPTION 'invalid_range: %', p_range USING ERRCODE = '22023';
  END IF;

  IF p_range = 'daily' THEN
    v_start_date  := v_today - 11;
    v_bucket_mode := 'day';
  ELSIF p_range = 'weekly' THEN
    v_start_date  := v_today - 83;
    v_bucket_mode := 'week';
  ELSE
    v_start_date  := (date_trunc('month', v_today) - interval '11 months')::date;
    v_bucket_mode := 'month';
  END IF;

  IF p_page < 1 THEN p_page := 1; END IF;
  IF p_page_size < 1 THEN p_page_size := 25; END IF;
  IF p_page_size > 100 THEN p_page_size := 100; END IF;
  v_offset := (p_page - 1) * p_page_size;

  SELECT jsonb_build_object(
    'total_hours',
      COALESCE((
        SELECT SUM(duration_minutes)::numeric / 60.0
        FROM work_sessions
        WHERE student_id = p_student_id AND status = 'completed'
      ), 0),
    'total_brand_outreach',
      COALESCE((
        SELECT SUM(COALESCE(brands_contacted,0))
        FROM daily_reports
        WHERE student_id = p_student_id AND submitted_at IS NOT NULL
      ), 0),
    'total_influencer_outreach',
      COALESCE((
        SELECT SUM(COALESCE(influencers_contacted,0))
        FROM daily_reports
        WHERE student_id = p_student_id AND submitted_at IS NOT NULL
      ), 0),
    'total_deals',
      (SELECT COUNT(*) FROM deals WHERE student_id = p_student_id),
    'total_revenue',
      COALESCE((SELECT SUM(revenue) FROM deals WHERE student_id = p_student_id), 0),
    'total_profit',
      COALESCE((SELECT SUM(profit) FROM deals WHERE student_id = p_student_id), 0)
  ) INTO v_totals;

  WITH recent AS (
    SELECT DISTINCT date
    FROM daily_reports
    WHERE student_id = p_student_id
      AND submitted_at IS NOT NULL
      AND date <= v_today
      AND date >= v_today - 365
    ORDER BY date DESC
  ),
  run AS (
    SELECT date,
           ROW_NUMBER() OVER (ORDER BY date DESC) AS rn,
           date + (ROW_NUMBER() OVER (ORDER BY date DESC))::int AS grp
    FROM recent
  )
  SELECT COUNT(*)::int INTO v_streak
  FROM run
  WHERE grp = (SELECT grp FROM run LIMIT 1)
    AND (SELECT MAX(date) FROM recent) = v_today;

  IF v_streak IS NULL THEN v_streak := 0; END IF;

  IF v_bucket_mode = 'day' THEN
    SELECT COALESCE(jsonb_agg(row ORDER BY row->>'bucket'), '[]'::jsonb)
    INTO v_outreach_trend
    FROM (
      SELECT jsonb_build_object(
        'bucket',      to_char(dr.date, 'YYYY-MM-DD'),
        'brands',      SUM(COALESCE(dr.brands_contacted,0))::int,
        'influencers', SUM(COALESCE(dr.influencers_contacted,0))::int
      ) AS row
      FROM daily_reports dr
      WHERE dr.student_id = p_student_id
        AND dr.submitted_at IS NOT NULL
        AND dr.date >= v_start_date
      GROUP BY dr.date
    ) s;
  ELSIF v_bucket_mode = 'week' THEN
    SELECT COALESCE(jsonb_agg(row ORDER BY row->>'bucket'), '[]'::jsonb)
    INTO v_outreach_trend
    FROM (
      SELECT jsonb_build_object(
        'bucket',      to_char(public.week_start(dr.date), 'YYYY-MM-DD'),
        'brands',      SUM(COALESCE(dr.brands_contacted,0))::int,
        'influencers', SUM(COALESCE(dr.influencers_contacted,0))::int
      ) AS row
      FROM daily_reports dr
      WHERE dr.student_id = p_student_id
        AND dr.submitted_at IS NOT NULL
        AND dr.date >= v_start_date
      GROUP BY public.week_start(dr.date)
    ) s;
  ELSE
    SELECT COALESCE(jsonb_agg(row ORDER BY row->>'bucket'), '[]'::jsonb)
    INTO v_outreach_trend
    FROM (
      SELECT jsonb_build_object(
        'bucket',      to_char(date_trunc('month', dr.date)::date, 'YYYY-MM-DD'),
        'brands',      SUM(COALESCE(dr.brands_contacted,0))::int,
        'influencers', SUM(COALESCE(dr.influencers_contacted,0))::int
      ) AS row
      FROM daily_reports dr
      WHERE dr.student_id = p_student_id
        AND dr.submitted_at IS NOT NULL
        AND dr.date >= v_start_date
      GROUP BY date_trunc('month', dr.date)
    ) s;
  END IF;

  IF v_bucket_mode = 'day' THEN
    SELECT COALESCE(jsonb_agg(row ORDER BY row->>'bucket'), '[]'::jsonb)
    INTO v_hours_trend
    FROM (
      SELECT jsonb_build_object(
        'bucket', to_char(ws.date, 'YYYY-MM-DD'),
        'hours',  ROUND((SUM(ws.duration_minutes)::numeric / 60.0), 2)
      ) AS row
      FROM work_sessions ws
      WHERE ws.student_id = p_student_id
        AND ws.status = 'completed'
        AND ws.date >= v_start_date
      GROUP BY ws.date
    ) s;
  ELSIF v_bucket_mode = 'week' THEN
    SELECT COALESCE(jsonb_agg(row ORDER BY row->>'bucket'), '[]'::jsonb)
    INTO v_hours_trend
    FROM (
      SELECT jsonb_build_object(
        'bucket', to_char(public.week_start(ws.date), 'YYYY-MM-DD'),
        'hours',  ROUND((SUM(ws.duration_minutes)::numeric / 60.0), 2)
      ) AS row
      FROM work_sessions ws
      WHERE ws.student_id = p_student_id
        AND ws.status = 'completed'
        AND ws.date >= v_start_date
      GROUP BY public.week_start(ws.date)
    ) s;
  ELSE
    SELECT COALESCE(jsonb_agg(row ORDER BY row->>'bucket'), '[]'::jsonb)
    INTO v_hours_trend
    FROM (
      SELECT jsonb_build_object(
        'bucket', to_char(date_trunc('month', ws.date)::date, 'YYYY-MM-DD'),
        'hours',  ROUND((SUM(ws.duration_minutes)::numeric / 60.0), 2)
      ) AS row
      FROM work_sessions ws
      WHERE ws.student_id = p_student_id
        AND ws.status = 'completed'
        AND ws.date >= v_start_date
      GROUP BY date_trunc('month', ws.date)
    ) s;
  END IF;

  SELECT COUNT(*) INTO v_total_deal_count
  FROM deals WHERE student_id = p_student_id;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'created_at') DESC), '[]'::jsonb)
  INTO v_deals
  FROM (
    SELECT jsonb_build_object(
      'id',          d.id,
      'deal_number', d.deal_number,
      'revenue',     d.revenue,
      'profit',      d.profit,
      'margin',      CASE WHEN d.revenue > 0
                          THEN ROUND((d.profit / d.revenue) * 100, 1)
                          ELSE 0
                     END,
      'created_at',  to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'logged_by',   d.logged_by,
      'logger_role', (SELECT u.role FROM users u WHERE u.id = d.logged_by),
      'is_self',     (d.logged_by = p_student_id)
    ) AS row
    FROM deals d
    WHERE d.student_id = p_student_id
    ORDER BY d.created_at DESC
    OFFSET v_offset
    LIMIT p_page_size
  ) s;

  v_deal_summary := jsonb_build_object(
    'count',   v_total_deal_count,
    'revenue', COALESCE((SELECT SUM(revenue) FROM deals WHERE student_id = p_student_id), 0),
    'profit',  COALESCE((SELECT SUM(profit)  FROM deals WHERE student_id = p_student_id), 0)
  );

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'step_number')::int), '[]'::jsonb)
  INTO v_roadmap
  FROM (
    SELECT jsonb_build_object(
      'step_number', rp.step_number,
      'status',      rp.status,
      'completed_at', CASE WHEN rp.completed_at IS NULL
                           THEN NULL
                           ELSE to_char(rp.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                      END
    ) AS row
    FROM roadmap_progress rp
    WHERE rp.student_id = p_student_id
  ) s;

  RETURN jsonb_build_object(
    'totals',            v_totals,
    'streak',            v_streak,
    'outreach_trend',    v_outreach_trend,
    'hours_trend',       v_hours_trend,
    'deals',             v_deals,
    'deal_summary',      v_deal_summary,
    'roadmap_progress',  v_roadmap,
    'range',             p_range,
    'page',              p_page,
    'page_size',         p_page_size,
    'total_deal_count',  v_total_deal_count
  );
END;
$function$;


-- get_coach_analytics: guard replaced, 8 int4 sum(s) widened to bigint, unused v_caller removed
CREATE OR REPLACE FUNCTION public.get_coach_analytics(p_coach_id uuid, p_window_days integer DEFAULT 7, p_today date DEFAULT CURRENT_DATE, p_leaderboard_limit integer DEFAULT 5, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25, p_sort text DEFAULT 'name_asc'::text, p_search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start      date;
  v_trend_start     date;
  v_student_ids     uuid[];
  v_search          text;
  v_window_days     int;
  v_lb_limit        int;
  v_page            int;
  v_page_size       int;
  v_offset          int;
  v_total           int := 0;
  v_stats           jsonb;
  v_leaderboards    jsonb;
  v_deals_trend     jsonb;
  v_active_inactive jsonb;
  v_students        jsonb;
  v_active_count    int := 0;
  v_inactive_count  int := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_window_days := LEAST(GREATEST(COALESCE(p_window_days, 7), 1), 365);
  v_lb_limit    := LEAST(GREATEST(COALESCE(p_leaderboard_limit, 5), 1), 50);
  v_page        := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size   := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 5000);
  v_offset      := (v_page - 1) * v_page_size;
  v_search      := NULLIF(TRIM(COALESCE(p_search, '')), '');

  v_week_start  := date_trunc('week', p_today)::date;
  v_trend_start := v_week_start - INTERVAL '11 weeks';

  SELECT array_agg(id)
  INTO v_student_ids
  FROM users
  WHERE role IN ('student','student_diy')
    AND coach_id = p_coach_id
    AND status = 'active';

  IF v_student_ids IS NULL OR array_length(v_student_ids, 1) IS NULL THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'week_start', to_char(wk, 'YYYY-MM-DD'),
          'deals',      0
        )
        ORDER BY wk
      ),
      '[]'::jsonb
    )
    INTO v_deals_trend
    FROM generate_series(v_trend_start, v_week_start, INTERVAL '1 week') AS gs(wk);

    RETURN jsonb_build_object(
      'stats', jsonb_build_object(
        'highest_deals',     jsonb_build_object('student_id', NULL, 'student_name', NULL, 'count', 0),
        'total_revenue',     0,
        'avg_roadmap_step',  0,
        'avg_email_count',   0,
        'most_emails',       jsonb_build_object('student_id', NULL, 'student_name', NULL, 'count', 0)
      ),
      'leaderboards', jsonb_build_object(
        'hours_week',     '[]'::jsonb,
        'emails_week',    '[]'::jsonb,
        'deals_alltime',  '[]'::jsonb
      ),
      'deals_trend', v_deals_trend,
      'active_inactive', jsonb_build_object('active', 0, 'inactive', 0),
      'students', '[]'::jsonb,
      'pagination', jsonb_build_object(
        'page',        v_page,
        'page_size',   v_page_size,
        'total',       0,
        'total_pages', 0
      )
    );
  END IF;

  SELECT COALESCE(
    jsonb_build_object(
      'student_id',   s.student_id,
      'student_name', s.student_name,
      'count',        s.cnt
    ),
    jsonb_build_object('student_id', NULL, 'student_name', NULL, 'count', 0)
  )
  INTO v_stats
  FROM (
    SELECT d.student_id, u.name AS student_name, COUNT(*)::int AS cnt
    FROM deals d
    JOIN users u ON u.id = d.student_id
    WHERE d.student_id = ANY(v_student_ids)
    GROUP BY d.student_id, u.name
    ORDER BY cnt DESC, LOWER(u.name) ASC
    LIMIT 1
  ) s;

  IF v_stats IS NULL THEN
    v_stats := jsonb_build_object('student_id', NULL, 'student_name', NULL, 'count', 0);
  END IF;

  v_stats := jsonb_build_object(
    'highest_deals',    v_stats,
    'total_revenue',    (
      SELECT COALESCE(SUM(revenue), 0)::numeric
      FROM deals
      WHERE student_id = ANY(v_student_ids)
    ),
    'avg_roadmap_step', (
      SELECT COALESCE(ROUND(AVG(per_student_step)::numeric, 1), 0)::numeric
      FROM (
        SELECT MAX(step_number) FILTER (WHERE status IN ('completed', 'active')) AS per_student_step
        FROM roadmap_progress
        WHERE student_id = ANY(v_student_ids)
        GROUP BY student_id
      ) t
    ),
    'avg_email_count',  (
      SELECT COALESCE(ROUND(AVG(per_student_emails)::numeric, 0), 0)::numeric
      FROM (
        SELECT
          COALESCE(SUM(COALESCE(brands_contacted,0)::bigint + COALESCE(influencers_contacted,0)::bigint), 0)::int AS per_student_emails
        FROM daily_reports
        WHERE student_id = ANY(v_student_ids)
          AND submitted_at IS NOT NULL
        GROUP BY student_id
      ) t
    ),
    'most_emails',      (
      SELECT COALESCE(
        jsonb_build_object(
          'student_id',   s.student_id,
          'student_name', s.student_name,
          'count',        s.cnt
        ),
        jsonb_build_object('student_id', NULL, 'student_name', NULL, 'count', 0)
      )
      FROM (
        SELECT
          r.student_id,
          u.name AS student_name,
          SUM(COALESCE(r.brands_contacted,0)::bigint + COALESCE(r.influencers_contacted,0)::bigint)::int AS cnt
        FROM daily_reports r
        JOIN users u ON u.id = r.student_id
        WHERE r.student_id = ANY(v_student_ids)
          AND r.submitted_at IS NOT NULL
        GROUP BY r.student_id, u.name
        ORDER BY cnt DESC, LOWER(u.name) ASC
        LIMIT 1
      ) s
    )
  );

  IF v_stats->'most_emails' IS NULL OR v_stats->'most_emails' = 'null'::jsonb THEN
    v_stats := jsonb_set(
      v_stats,
      '{most_emails}',
      jsonb_build_object('student_id', NULL, 'student_name', NULL, 'count', 0),
      true
    );
  END IF;

  WITH hours_rows AS (
    SELECT
      u.id   AS student_id,
      u.name AS student_name,
      COALESCE(SUM(ws.duration_minutes), 0)::int AS minutes
    FROM users u
    LEFT JOIN work_sessions ws
      ON ws.student_id = u.id
     AND ws.status = 'completed'
     AND ws.date >= v_week_start
     AND ws.date <= p_today
    WHERE u.id = ANY(v_student_ids)
    GROUP BY u.id, u.name
    HAVING COALESCE(SUM(ws.duration_minutes), 0) > 0
  ),
  hours_ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY minutes DESC, LOWER(student_name) ASC)::int AS rank,
      student_id, student_name, minutes
    FROM hours_rows
  ),
  emails_rows AS (
    SELECT
      r.student_id,
      u.name AS student_name,
      SUM(COALESCE(r.brands_contacted,0)::bigint + COALESCE(r.influencers_contacted,0)::bigint)::int AS emails
    FROM daily_reports r
    JOIN users u ON u.id = r.student_id
    WHERE r.student_id = ANY(v_student_ids)
      AND r.submitted_at IS NOT NULL
      AND r.date >= v_week_start
      AND r.date <= p_today
    GROUP BY r.student_id, u.name
    HAVING SUM(COALESCE(r.brands_contacted,0)::bigint + COALESCE(r.influencers_contacted,0)::bigint) > 0
  ),
  emails_ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY emails DESC, LOWER(student_name) ASC)::int AS rank,
      student_id, student_name, emails
    FROM emails_rows
  ),
  deals_rows AS (
    SELECT
      d.student_id,
      u.name AS student_name,
      COUNT(*)::int AS deals
    FROM deals d
    JOIN users u ON u.id = d.student_id
    WHERE d.student_id = ANY(v_student_ids)
    GROUP BY d.student_id, u.name
    HAVING COUNT(*) > 0
  ),
  deals_ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY deals DESC, LOWER(student_name) ASC)::int AS rank,
      student_id, student_name, deals
    FROM deals_rows
  )
  SELECT jsonb_build_object(
    'hours_week', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rank', rank, 'student_id', student_id, 'student_name', student_name, 'minutes', minutes
      ) ORDER BY rank)
      FROM hours_ranked WHERE rank <= v_lb_limit
    ), '[]'::jsonb),
    'emails_week', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rank', rank, 'student_id', student_id, 'student_name', student_name, 'emails', emails
      ) ORDER BY rank)
      FROM emails_ranked WHERE rank <= v_lb_limit
    ), '[]'::jsonb),
    'deals_alltime', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rank', rank, 'student_id', student_id, 'student_name', student_name, 'deals', deals
      ) ORDER BY rank)
      FROM deals_ranked WHERE rank <= v_lb_limit
    ), '[]'::jsonb)
  )
  INTO v_leaderboards;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'week_start') ASC), '[]'::jsonb)
  INTO v_deals_trend
  FROM (
    SELECT jsonb_build_object(
      'week_start', to_char(wk, 'YYYY-MM-DD'),
      'deals',      COALESCE(d.cnt, 0)::int
    ) AS row
    FROM generate_series(v_trend_start, v_week_start, INTERVAL '1 week') AS gs(wk)
    LEFT JOIN (
      SELECT date_trunc('week', created_at)::date AS wk, COUNT(*)::int AS cnt
      FROM deals
      WHERE student_id = ANY(v_student_ids)
        AND created_at >= v_trend_start
        AND created_at < v_week_start + INTERVAL '7 days'
      GROUP BY date_trunc('week', created_at)
    ) d ON d.wk = gs.wk::date
  ) s;

  SELECT
    COUNT(*) FILTER (WHERE public.student_activity_status(id, p_today) = 'active')::int,
    COUNT(*) FILTER (WHERE public.student_activity_status(id, p_today) = 'inactive')::int
  INTO v_active_count, v_inactive_count
  FROM users
  WHERE id = ANY(v_student_ids);

  v_active_inactive := jsonb_build_object(
    'active',   COALESCE(v_active_count, 0),
    'inactive', COALESCE(v_inactive_count, 0)
  );

  WITH per_student AS (
    SELECT
      u.id   AS student_id,
      u.name AS name,
      COALESCE((SELECT SUM(ws.duration_minutes::bigint)::int FROM work_sessions ws WHERE ws.student_id = u.id AND ws.status = 'completed' AND ws.date >= v_week_start AND ws.date <= p_today), 0)::int AS hours_this_week_minutes,
      COALESCE((SELECT SUM(COALESCE(r.brands_contacted,0)::bigint + COALESCE(r.influencers_contacted,0)::bigint)::int FROM daily_reports r WHERE r.student_id = u.id AND r.submitted_at IS NOT NULL AND r.date >= v_week_start AND r.date <= p_today), 0)::int AS emails_this_week,
      COALESCE((SELECT COUNT(*)::int FROM deals d WHERE d.student_id = u.id), 0)::int AS deals_alltime,
      COALESCE((SELECT MAX(rp.step_number) FROM roadmap_progress rp WHERE rp.student_id = u.id AND rp.status IN ('completed', 'active')), 0)::int AS roadmap_step,
      (SELECT GREATEST((SELECT MAX(ws.date) FROM work_sessions ws WHERE ws.student_id = u.id AND ws.status = 'completed'), (SELECT MAX(r.date) FROM daily_reports r WHERE r.student_id = u.id AND r.submitted_at IS NOT NULL))) AS last_active_date,
      public.student_activity_status(u.id, p_today) AS activity_status
    FROM users u
    WHERE u.id = ANY(v_student_ids)
      AND (v_search IS NULL OR u.name ILIKE '%' || v_search || '%')
  )
  SELECT COUNT(*)::int INTO v_total FROM per_student;

  WITH per_student AS (
    SELECT
      u.id   AS student_id,
      u.name AS name,
      COALESCE((SELECT SUM(ws.duration_minutes::bigint)::int FROM work_sessions ws WHERE ws.student_id = u.id AND ws.status = 'completed' AND ws.date >= v_week_start AND ws.date <= p_today), 0)::int AS hours_this_week_minutes,
      COALESCE((SELECT SUM(COALESCE(r.brands_contacted,0)::bigint + COALESCE(r.influencers_contacted,0)::bigint)::int FROM daily_reports r WHERE r.student_id = u.id AND r.submitted_at IS NOT NULL AND r.date >= v_week_start AND r.date <= p_today), 0)::int AS emails_this_week,
      COALESCE((SELECT COUNT(*)::int FROM deals d WHERE d.student_id = u.id), 0)::int AS deals_alltime,
      COALESCE((SELECT MAX(rp.step_number) FROM roadmap_progress rp WHERE rp.student_id = u.id AND rp.status IN ('completed', 'active')), 0)::int AS roadmap_step,
      (SELECT GREATEST((SELECT MAX(ws.date) FROM work_sessions ws WHERE ws.student_id = u.id AND ws.status = 'completed'), (SELECT MAX(r.date) FROM daily_reports r WHERE r.student_id = u.id AND r.submitted_at IS NOT NULL))) AS last_active_date,
      public.student_activity_status(u.id, p_today) AS activity_status
    FROM users u
    WHERE u.id = ANY(v_student_ids)
      AND (v_search IS NULL OR u.name ILIKE '%' || v_search || '%')
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'student_id',              page_rows.student_id,
    'name',                    page_rows.name,
    'hours_this_week_minutes', page_rows.hours_this_week_minutes,
    'emails_this_week',        page_rows.emails_this_week,
    'deals_alltime',           page_rows.deals_alltime,
    'roadmap_step',            page_rows.roadmap_step,
    'last_active_date',        CASE WHEN page_rows.last_active_date IS NULL THEN NULL ELSE to_char(page_rows.last_active_date, 'YYYY-MM-DD') END,
    'activity_status',         page_rows.activity_status
  ) ORDER BY page_rows.row_pos), '[]'::jsonb)
  INTO v_students
  FROM (
    SELECT
      ROW_NUMBER() OVER (ORDER BY
        CASE WHEN p_sort = 'name_asc'         THEN LOWER(name)             END ASC  NULLS LAST,
        CASE WHEN p_sort = 'name_desc'        THEN LOWER(name)             END DESC NULLS LAST,
        CASE WHEN p_sort = 'hours_asc'        THEN hours_this_week_minutes END ASC  NULLS LAST,
        CASE WHEN p_sort = 'hours_desc'       THEN hours_this_week_minutes END DESC NULLS LAST,
        CASE WHEN p_sort = 'emails_asc'       THEN emails_this_week        END ASC  NULLS LAST,
        CASE WHEN p_sort = 'emails_desc'      THEN emails_this_week        END DESC NULLS LAST,
        CASE WHEN p_sort = 'deals_asc'        THEN deals_alltime           END ASC  NULLS LAST,
        CASE WHEN p_sort = 'deals_desc'       THEN deals_alltime           END DESC NULLS LAST,
        CASE WHEN p_sort = 'step_asc'         THEN roadmap_step            END ASC  NULLS LAST,
        CASE WHEN p_sort = 'step_desc'        THEN roadmap_step            END DESC NULLS LAST,
        CASE WHEN p_sort = 'lastActive_asc'   THEN last_active_date        END ASC  NULLS LAST,
        CASE WHEN p_sort = 'lastActive_desc'  THEN last_active_date        END DESC NULLS LAST,
        LOWER(name) ASC
      ) AS row_pos,
      *
    FROM per_student
    ORDER BY
      CASE WHEN p_sort = 'name_asc'         THEN LOWER(name)             END ASC  NULLS LAST,
      CASE WHEN p_sort = 'name_desc'        THEN LOWER(name)             END DESC NULLS LAST,
      CASE WHEN p_sort = 'hours_asc'        THEN hours_this_week_minutes END ASC  NULLS LAST,
      CASE WHEN p_sort = 'hours_desc'       THEN hours_this_week_minutes END DESC NULLS LAST,
      CASE WHEN p_sort = 'emails_asc'       THEN emails_this_week        END ASC  NULLS LAST,
      CASE WHEN p_sort = 'emails_desc'      THEN emails_this_week        END DESC NULLS LAST,
      CASE WHEN p_sort = 'deals_asc'        THEN deals_alltime           END ASC  NULLS LAST,
      CASE WHEN p_sort = 'deals_desc'       THEN deals_alltime           END DESC NULLS LAST,
      CASE WHEN p_sort = 'step_asc'         THEN roadmap_step            END ASC  NULLS LAST,
      CASE WHEN p_sort = 'step_desc'        THEN roadmap_step            END DESC NULLS LAST,
      CASE WHEN p_sort = 'lastActive_asc'   THEN last_active_date        END ASC  NULLS LAST,
      CASE WHEN p_sort = 'lastActive_desc'  THEN last_active_date        END DESC NULLS LAST,
      LOWER(name) ASC
    OFFSET v_offset
    LIMIT v_page_size
  ) page_rows;

  RETURN jsonb_build_object(
    'stats',           v_stats,
    'leaderboards',    v_leaderboards,
    'deals_trend',     v_deals_trend,
    'active_inactive', v_active_inactive,
    'students',        v_students,
    'pagination', jsonb_build_object(
      'page',        v_page,
      'page_size',   v_page_size,
      'total',       v_total,
      'total_pages', CASE WHEN v_page_size = 0 THEN 0 ELSE CEIL(v_total::numeric / v_page_size)::int END
    )
  );
END;
$function$;


-- get_coach_dashboard: guard replaced, 1 int4 sum(s) widened to bigint, unused v_caller removed
CREATE OR REPLACE FUNCTION public.get_coach_dashboard(p_coach_id uuid, p_week_start date DEFAULT NULL::date, p_today date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start      date;
  v_student_ids     uuid[];
  v_deals_closed    int     := 0;
  v_revenue         numeric := 0;
  v_avg_step        numeric := 0;
  v_emails_sent     int     := 0;
  v_recent_reports  jsonb;
  v_top_hours_week  jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_week_start := COALESCE(p_week_start, date_trunc('week', p_today)::date);

  SELECT array_agg(id)
  INTO v_student_ids
  FROM users
  WHERE role IN ('student','student_diy')
    AND coach_id = p_coach_id
    AND status = 'active';

  IF v_student_ids IS NULL OR array_length(v_student_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'stats', jsonb_build_object(
        'deals_closed',     0,
        'revenue',          0,
        'avg_roadmap_step', 0,
        'emails_sent',      0
      ),
      'recent_reports', '[]'::jsonb,
      'top_hours_week', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(COUNT(*), 0)::int INTO v_deals_closed
  FROM deals WHERE student_id = ANY(v_student_ids);

  SELECT COALESCE(SUM(revenue), 0)::numeric INTO v_revenue
  FROM deals WHERE student_id = ANY(v_student_ids);

  SELECT COALESCE(ROUND(AVG(per_student_step)::numeric, 1), 0)::numeric
  INTO v_avg_step
  FROM (
    SELECT MAX(step_number) FILTER (WHERE status IN ('completed', 'active')) AS per_student_step
    FROM roadmap_progress
    WHERE student_id = ANY(v_student_ids)
    GROUP BY student_id
  ) s;

  SELECT COALESCE(SUM(COALESCE(brands_contacted,0)::bigint + COALESCE(influencers_contacted,0)::bigint), 0)::int
  INTO v_emails_sent
  FROM daily_reports
  WHERE student_id = ANY(v_student_ids)
    AND submitted_at IS NOT NULL;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'submitted_at') DESC NULLS LAST), '[]'::jsonb)
  INTO v_recent_reports
  FROM (
    SELECT jsonb_build_object(
      'id',           r.id,
      'student_id',   r.student_id,
      'student_name', u.name,
      'date',         to_char(r.date, 'YYYY-MM-DD'),
      'star_rating',  r.star_rating,
      'submitted_at', to_char(r.submitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ) AS row
    FROM daily_reports r
    JOIN users u ON u.id = r.student_id
    WHERE r.student_id = ANY(v_student_ids)
      AND r.submitted_at IS NOT NULL
    ORDER BY r.submitted_at DESC NULLS LAST
    LIMIT 3
  ) s;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'minutes')::int DESC), '[]'::jsonb)
  INTO v_top_hours_week
  FROM (
    SELECT jsonb_build_object(
      'student_id',   u.id,
      'student_name', u.name,
      'minutes',      COALESCE(SUM(ws.duration_minutes), 0)::int
    ) AS row
    FROM users u
    LEFT JOIN work_sessions ws
      ON ws.student_id = u.id
     AND ws.status     = 'completed'
     AND ws.date      >= v_week_start
     AND ws.date      <= p_today
    WHERE u.id = ANY(v_student_ids)
    GROUP BY u.id, u.name
    HAVING COALESCE(SUM(ws.duration_minutes), 0) > 0
    ORDER BY COALESCE(SUM(ws.duration_minutes), 0) DESC
    LIMIT 3
  ) s;

  RETURN jsonb_build_object(
    'stats', jsonb_build_object(
      'deals_closed',     v_deals_closed,
      'revenue',          v_revenue,
      'avg_roadmap_step', v_avg_step,
      'emails_sent',      v_emails_sent
    ),
    'recent_reports', v_recent_reports,
    'top_hours_week', v_top_hours_week
  );
END;
$function$;


-- get_coach_milestones: guard replaced, unused v_caller removed
CREATE OR REPLACE FUNCTION public.get_coach_milestones(p_coach_id uuid, p_today date DEFAULT CURRENT_DATE, p_tech_setup_enabled boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_ids uuid[];
  v_milestones  jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(id) INTO v_student_ids
  FROM users
  WHERE role IN ('student', 'student_diy')
    AND status = 'active'
    AND coach_id = p_coach_id;

  IF v_student_ids IS NULL OR array_length(v_student_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('milestones', '[]'::jsonb, 'count', 0);
  END IF;

  WITH
  five_inf AS (
    SELECT
      ('milestone_5_influencers:' || rp.student_id::text) AS alert_key,
      rp.student_id AS student_id,
      u.name AS student_name,
      '5_influencers'::text AS milestone_type,
      NULL::uuid AS deal_id,
      rp.completed_at AS occurred_at
    FROM roadmap_progress rp
    JOIN users u ON u.id = rp.student_id
    WHERE rp.student_id = ANY(v_student_ids)
      AND rp.step_number = 11
      AND rp.status = 'completed'
      AND rp.completed_at IS NOT NULL
  ),
  brand_resp AS (
    SELECT
      ('milestone_brand_response:' || rp.student_id::text),
      rp.student_id, u.name, 'brand_response'::text, NULL::uuid, rp.completed_at
    FROM roadmap_progress rp
    JOIN users u ON u.id = rp.student_id
    WHERE rp.student_id = ANY(v_student_ids)
      AND rp.step_number = 13
      AND rp.status = 'completed'
      AND rp.completed_at IS NOT NULL
  ),
  closed_deals AS (
    SELECT
      ('milestone_closed_deal:' || d.student_id::text || ':' || d.id::text),
      d.student_id, u.name, 'closed_deal'::text, d.id AS deal_id, d.created_at AS occurred_at
    FROM deals d
    JOIN users u ON u.id = d.student_id
    WHERE d.student_id = ANY(v_student_ids)
  ),
  tech_setup AS (
    SELECT
      ('milestone_tech_setup:' || rp.student_id::text),
      rp.student_id, u.name, 'tech_setup'::text, NULL::uuid, rp.completed_at
    FROM roadmap_progress rp
    JOIN users u ON u.id = rp.student_id
    WHERE p_tech_setup_enabled = true
      AND rp.student_id = ANY(v_student_ids)
      AND rp.step_number = 0
      AND rp.status = 'completed'
      AND rp.completed_at IS NOT NULL
  ),
  all_events AS (
    SELECT * FROM five_inf
    UNION ALL SELECT * FROM brand_resp
    UNION ALL SELECT * FROM closed_deals
    UNION ALL SELECT * FROM tech_setup
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'student_id',     ae.student_id,
      'student_name',   ae.student_name,
      'milestone_type', ae.milestone_type,
      'alert_key',      ae.alert_key,
      'deal_id',        ae.deal_id,
      'occurred_at',    ae.occurred_at
    )
    ORDER BY ae.occurred_at DESC
  ), '[]'::jsonb)
  INTO v_milestones
  FROM all_events ae
  LEFT JOIN alert_dismissals ad
    ON ad.owner_id = p_coach_id
   AND ad.alert_key = ae.alert_key
  WHERE ad.alert_key IS NULL;

  RETURN jsonb_build_object(
    'milestones', v_milestones,
    'count',      jsonb_array_length(v_milestones)
  );
END;
$function$;


-- get_student_summary: guard replaced, 1 int4 sum(s) widened to bigint, unused v_caller removed
CREATE OR REPLACE FUNCTION public.get_student_summary(p_student_id uuid, p_period_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'hours_worked', COALESCE((SELECT SUM(duration_minutes)::numeric / 60.0 FROM work_sessions WHERE student_id = p_student_id AND status = 'completed' AND date >= p_period_start), 0),
    'deals_closed', (SELECT COUNT(*) FROM deals WHERE student_id = p_student_id AND created_at >= p_period_start),
    'revenue',      COALESCE((SELECT SUM(revenue) FROM deals WHERE student_id = p_student_id AND created_at >= p_period_start), 0),
    'profit',       COALESCE((SELECT SUM(profit) FROM deals WHERE student_id = p_student_id AND created_at >= p_period_start), 0),
    'outreach',     COALESCE((SELECT SUM(COALESCE(brands_contacted,0)::bigint + COALESCE(influencers_contacted,0)::bigint) FROM daily_reports WHERE student_id = p_student_id AND submitted_at IS NOT NULL AND date >= p_period_start), 0),
    'reports_submitted', (SELECT COUNT(*) FROM daily_reports WHERE student_id = p_student_id AND submitted_at IS NOT NULL AND date >= p_period_start)
  );
END;
$function$;


-- get_weekly_skip_counts: guard inserted, array bound added
CREATE OR REPLACE FUNCTION public.get_weekly_skip_counts(p_student_ids uuid[], p_today date, p_current_hour integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start   date := date_trunc('week', p_today)::date;
  v_count_through date;
  v_result       jsonb := '{}'::jsonb;
  v_sid          uuid;
  v_skip_count   integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_student_ids IS NULL OR array_length(p_student_ids, 1) > 500 THEN
    RAISE EXCEPTION 'too_many_students' USING ERRCODE = '22023';
  END IF;

  IF p_current_hour >= 23 THEN
    v_count_through := p_today;
  ELSE
    v_count_through := p_today - interval '1 day';
  END IF;

  IF v_count_through < v_week_start THEN
    FOREACH v_sid IN ARRAY p_student_ids LOOP
      v_result := v_result || jsonb_build_object(v_sid::text, 0);
    END LOOP;
    RETURN v_result;
  END IF;

  FOREACH v_sid IN ARRAY p_student_ids LOOP
    SELECT count(*) INTO v_skip_count
    FROM generate_series(v_week_start, v_count_through, interval '1 day') AS d(day_date)
    WHERE NOT EXISTS (
      SELECT 1 FROM work_sessions ws
      WHERE ws.student_id = v_sid
        AND ws.date = d.day_date::date
        AND ws.status = 'completed'
    )
    AND NOT EXISTS (
      SELECT 1 FROM daily_reports dr
      WHERE dr.student_id = v_sid
        AND dr.date = d.day_date::date
        AND dr.submitted_at IS NOT NULL
    );

    v_result := v_result || jsonb_build_object(v_sid::text, v_skip_count);
  END LOOP;

  RETURN v_result;
END;
$function$;


-- get_sidebar_badges: guard inserted
CREATE OR REPLACE FUNCTION public.get_sidebar_badges(p_user_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report_inbox_days integer := 7;
  v_today date := CURRENT_DATE;
  v_unreviewed_count     integer := 0;
  v_student              RECORD;
  v_milestone_count      integer := 0;
  v_milestone_dismissed  integer := 0;
  v_deal_count       integer := 0;
  v_dismissed_count  integer := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_role = 'coach' THEN
    SELECT count(*)
      INTO v_unreviewed_count
      FROM daily_reports dr
      JOIN users s ON s.id = dr.student_id
     WHERE s.coach_id = p_user_id
       AND s.status   = 'active'
       AND dr.date   >= (v_today - v_report_inbox_days)
       AND dr.reviewed_by IS NULL
       AND dr.submitted_at IS NOT NULL;

    FOR v_student IN
      SELECT u.id
      FROM users u
      WHERE u.role = 'student'
        AND u.status = 'active'
        AND u.coach_id = p_user_id
        AND u.joined_at >= CURRENT_DATE - 45
    LOOP
      IF (
        SELECT COALESCE(SUM(ws.session_minutes), 0)
        FROM work_sessions ws
        WHERE ws.student_id = v_student.id
          AND ws.status = 'completed'
      ) >= 6000 THEN
        v_milestone_count := v_milestone_count + 1;
      END IF;
    END LOOP;

    SELECT count(*)
      INTO v_milestone_dismissed
      FROM alert_dismissals
     WHERE owner_id = p_user_id
       AND alert_key LIKE '100h_milestone:%';

    RETURN jsonb_build_object(
      'unreviewed_reports', v_unreviewed_count,
      'coach_milestone_alerts', GREATEST(0, v_milestone_count - v_milestone_dismissed)
    );
  END IF;

  IF p_role = 'student' THEN
    RETURN '{}'::jsonb;
  END IF;

  IF p_role = 'owner' THEN
    SELECT COUNT(*)
      INTO v_deal_count
      FROM deals d
     WHERE d.created_at >= NOW() - INTERVAL '30 days';

    SELECT COUNT(*)
      INTO v_dismissed_count
      FROM alert_dismissals ad
      JOIN deals d
        ON d.id::text = split_part(ad.alert_key, ':', 2)
     WHERE ad.owner_id = p_user_id
       AND ad.alert_key LIKE 'deal_closed:%'
       AND d.created_at >= NOW() - INTERVAL '30 days';

    RETURN jsonb_build_object(
      'active_alerts', GREATEST(0, v_deal_count - v_dismissed_count)
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$function$;

-- =============================================================================
-- PART 3 — Grant lockdown (the part 00049 missed).
--
-- PostgreSQL grants EXECUTE on every new function to PUBLIC by default, and
-- anon/authenticated inherit PUBLIC's privileges. 00049 revoked only the
-- explicit per-role grants, leaving the implicit `=X/postgres` ACL entry — so
-- anon kept EXECUTE on every SECURITY DEFINER RPC. Revoke PUBLIC first, then
-- the roles, then re-grant only what is genuinely needed.
-- =============================================================================

REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM anon, authenticated;

GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON ROUTINES TO service_role;

-- RLS helpers MUST stay executable by anon/authenticated: policy expressions
-- call them and are evaluated as the querying role. They leak nothing — they
-- resolve only the CALLER's own id/role via auth.uid(). Confirmed by reading
-- pg_policy: these are the only two public functions any policy calls.
GRANT EXECUTE ON FUNCTION public.get_user_id()   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO anon, authenticated, service_role;

-- Table and sequence grants are intentionally left alone: RLS is the access
-- layer for table data, and revoking here would over-reach.

COMMIT;
