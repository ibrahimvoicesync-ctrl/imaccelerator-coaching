-- ============================================================================
-- Phase 48 fix-up: get_coach_analytics referenced an unqualified `wk` column
-- in the 12-week deals trend subquery. Both the generate_series alias `gs(wk)`
-- and the LEFT JOIN subquery alias `d.wk` expose a `wk` column, making the
-- outer SELECT ambiguous (Postgres 42702). The zero-student short-circuit path
-- hid this bug because it used a separate query with only one source.
--
-- Fix: qualify the outer reference as `gs.wk`. Single-line patch applied via
-- CREATE OR REPLACE of the function with the corrected body.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_coach_analytics(
  p_coach_id          uuid,
  p_window_days       int     DEFAULT 7,
  p_today             date    DEFAULT CURRENT_DATE,
  p_leaderboard_limit int     DEFAULT 5,
  p_page              int     DEFAULT 1,
  p_page_size         int     DEFAULT 25,
  p_sort              text    DEFAULT 'name_asc',
  p_search            text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller          uuid := (SELECT auth.uid());
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
  IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM p_coach_id THEN
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
  WHERE role = 'student'
    AND coach_id = p_coach_id
    AND status = 'active';

  IF v_student_ids IS NULL OR array_length(v_student_ids, 1) IS NULL THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'week_start', to_char(gs.wk, 'YYYY-MM-DD'),
          'deals',      0
        )
        ORDER BY gs.wk
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
          COALESCE(SUM(COALESCE(brands_contacted, 0) + COALESCE(influencers_contacted, 0)), 0)::int AS per_student_emails
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
          SUM(COALESCE(r.brands_contacted, 0) + COALESCE(r.influencers_contacted, 0))::int AS cnt
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
      student_id,
      student_name,
      minutes
    FROM hours_rows
  ),
  emails_rows AS (
    SELECT
      r.student_id,
      u.name AS student_name,
      SUM(COALESCE(r.brands_contacted, 0) + COALESCE(r.influencers_contacted, 0))::int AS emails
    FROM daily_reports r
    JOIN users u ON u.id = r.student_id
    WHERE r.student_id = ANY(v_student_ids)
      AND r.submitted_at IS NOT NULL
      AND r.date >= v_week_start
      AND r.date <= p_today
    GROUP BY r.student_id, u.name
    HAVING SUM(COALESCE(r.brands_contacted, 0) + COALESCE(r.influencers_contacted, 0)) > 0
  ),
  emails_ranked AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY emails DESC, LOWER(student_name) ASC)::int AS rank,
      student_id,
      student_name,
      emails
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
      student_id,
      student_name,
      deals
    FROM deals_rows
  )
  SELECT jsonb_build_object(
    'hours_week', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rank',         rank,
        'student_id',   student_id,
        'student_name', student_name,
        'minutes',      minutes
      ) ORDER BY rank)
      FROM hours_ranked
      WHERE rank <= v_lb_limit
    ), '[]'::jsonb),
    'emails_week', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rank',         rank,
        'student_id',   student_id,
        'student_name', student_name,
        'emails',       emails
      ) ORDER BY rank)
      FROM emails_ranked
      WHERE rank <= v_lb_limit
    ), '[]'::jsonb),
    'deals_alltime', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rank',         rank,
        'student_id',   student_id,
        'student_name', student_name,
        'deals',        deals
      ) ORDER BY rank)
      FROM deals_ranked
      WHERE rank <= v_lb_limit
    ), '[]'::jsonb)
  )
  INTO v_leaderboards;

  -- FIX: qualify wk as gs.wk (ambiguous with d.wk from the LEFT JOIN subquery)
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'week_start') ASC), '[]'::jsonb)
  INTO v_deals_trend
  FROM (
    SELECT jsonb_build_object(
      'week_start', to_char(gs.wk, 'YYYY-MM-DD'),
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
      COALESCE((
        SELECT SUM(ws.duration_minutes)::int
        FROM work_sessions ws
        WHERE ws.student_id = u.id
          AND ws.status = 'completed'
          AND ws.date >= v_week_start
          AND ws.date <= p_today
      ), 0)::int AS hours_this_week_minutes,
      COALESCE((
        SELECT SUM(COALESCE(r.brands_contacted, 0) + COALESCE(r.influencers_contacted, 0))::int
        FROM daily_reports r
        WHERE r.student_id = u.id
          AND r.submitted_at IS NOT NULL
          AND r.date >= v_week_start
          AND r.date <= p_today
      ), 0)::int AS emails_this_week,
      COALESCE((
        SELECT COUNT(*)::int
        FROM deals d
        WHERE d.student_id = u.id
      ), 0)::int AS deals_alltime,
      COALESCE((
        SELECT MAX(rp.step_number)
        FROM roadmap_progress rp
        WHERE rp.student_id = u.id
          AND rp.status IN ('completed', 'active')
      ), 0)::int AS roadmap_step,
      (
        SELECT GREATEST(
          (SELECT MAX(ws.date) FROM work_sessions ws WHERE ws.student_id = u.id AND ws.status = 'completed'),
          (SELECT MAX(r.date)  FROM daily_reports r WHERE r.student_id = u.id AND r.submitted_at IS NOT NULL)
        )
      ) AS last_active_date,
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
      COALESCE((
        SELECT SUM(ws.duration_minutes)::int
        FROM work_sessions ws
        WHERE ws.student_id = u.id
          AND ws.status = 'completed'
          AND ws.date >= v_week_start
          AND ws.date <= p_today
      ), 0)::int AS hours_this_week_minutes,
      COALESCE((
        SELECT SUM(COALESCE(r.brands_contacted, 0) + COALESCE(r.influencers_contacted, 0))::int
        FROM daily_reports r
        WHERE r.student_id = u.id
          AND r.submitted_at IS NOT NULL
          AND r.date >= v_week_start
          AND r.date <= p_today
      ), 0)::int AS emails_this_week,
      COALESCE((
        SELECT COUNT(*)::int
        FROM deals d
        WHERE d.student_id = u.id
      ), 0)::int AS deals_alltime,
      COALESCE((
        SELECT MAX(rp.step_number)
        FROM roadmap_progress rp
        WHERE rp.student_id = u.id
          AND rp.status IN ('completed', 'active')
      ), 0)::int AS roadmap_step,
      (
        SELECT GREATEST(
          (SELECT MAX(ws.date) FROM work_sessions ws WHERE ws.student_id = u.id AND ws.status = 'completed'),
          (SELECT MAX(r.date)  FROM daily_reports r WHERE r.student_id = u.id AND r.submitted_at IS NOT NULL)
        )
      ) AS last_active_date,
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
        CASE WHEN p_sort = 'name_asc'         THEN LOWER(name)                          END ASC  NULLS LAST,
        CASE WHEN p_sort = 'name_desc'        THEN LOWER(name)                          END DESC NULLS LAST,
        CASE WHEN p_sort = 'hours_asc'        THEN hours_this_week_minutes              END ASC  NULLS LAST,
        CASE WHEN p_sort = 'hours_desc'       THEN hours_this_week_minutes              END DESC NULLS LAST,
        CASE WHEN p_sort = 'emails_asc'       THEN emails_this_week                     END ASC  NULLS LAST,
        CASE WHEN p_sort = 'emails_desc'      THEN emails_this_week                     END DESC NULLS LAST,
        CASE WHEN p_sort = 'deals_asc'        THEN deals_alltime                        END ASC  NULLS LAST,
        CASE WHEN p_sort = 'deals_desc'       THEN deals_alltime                        END DESC NULLS LAST,
        CASE WHEN p_sort = 'step_asc'         THEN roadmap_step                         END ASC  NULLS LAST,
        CASE WHEN p_sort = 'step_desc'        THEN roadmap_step                         END DESC NULLS LAST,
        CASE WHEN p_sort = 'lastActive_asc'   THEN last_active_date                     END ASC  NULLS LAST,
        CASE WHEN p_sort = 'lastActive_desc'  THEN last_active_date                     END DESC NULLS LAST,
        LOWER(name) ASC
      ) AS row_pos,
      *
    FROM per_student
    ORDER BY
      CASE WHEN p_sort = 'name_asc'         THEN LOWER(name)                          END ASC  NULLS LAST,
      CASE WHEN p_sort = 'name_desc'        THEN LOWER(name)                          END DESC NULLS LAST,
      CASE WHEN p_sort = 'hours_asc'        THEN hours_this_week_minutes              END ASC  NULLS LAST,
      CASE WHEN p_sort = 'hours_desc'       THEN hours_this_week_minutes              END DESC NULLS LAST,
      CASE WHEN p_sort = 'emails_asc'       THEN emails_this_week                     END ASC  NULLS LAST,
      CASE WHEN p_sort = 'emails_desc'      THEN emails_this_week                     END DESC NULLS LAST,
      CASE WHEN p_sort = 'deals_asc'        THEN deals_alltime                        END ASC  NULLS LAST,
      CASE WHEN p_sort = 'deals_desc'       THEN deals_alltime                        END DESC NULLS LAST,
      CASE WHEN p_sort = 'step_asc'         THEN roadmap_step                         END ASC  NULLS LAST,
      CASE WHEN p_sort = 'step_desc'        THEN roadmap_step                         END DESC NULLS LAST,
      CASE WHEN p_sort = 'lastActive_asc'   THEN last_active_date                     END ASC  NULLS LAST,
      CASE WHEN p_sort = 'lastActive_desc'  THEN last_active_date                     END DESC NULLS LAST,
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
$$;
