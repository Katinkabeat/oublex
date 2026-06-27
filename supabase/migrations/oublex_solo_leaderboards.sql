-- ============================================================
-- Oublex — c92 extended leaderboards (Day/Week/Month/All-time)
--
-- Two RPCs, per-user, SUM-across-window:
--   oublex_solo_leaderboard(p_timeframe, p_date)  — top 10
--   oublex_solo_my_rank(p_timeframe, p_date)      — caller's rank+score
--
-- Each user appears at most once per leaderboard. For Day, "score"
-- is that day's score; for Week/Month/All, it's SUM(score) over
-- the window. Tie-break: latest play in window ASC.
--
-- For games where users can play many times per day (Rungles-style),
-- swap to per-user-BEST ranking — see
-- rungles/supabase/migration-014-extended-leaderboards.sql and
-- migration-015-leaderboard-per-user-best.sql for the pattern.
--
-- Source table assumed: oublex_solo_results(user_id, play_date,
-- score, completed_at) — see oublex_solo_results.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION public.oublex_solo_leaderboard(
  p_timeframe text,
  p_date      date DEFAULT current_date
)
RETURNS TABLE (
  user_id      uuid,
  username     text,
  avatar_hue   int,
  score        int,
  completed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end   date;  -- exclusive
BEGIN
  CASE p_timeframe
    WHEN 'day'   THEN v_start := p_date;                            v_end := p_date + 1;
    WHEN 'week'  THEN v_start := date_trunc('week',  p_date)::date; v_end := v_start + 7;
    WHEN 'month' THEN v_start := date_trunc('month', p_date)::date; v_end := (v_start + interval '1 month')::date;
    WHEN 'all'   THEN v_start := NULL;                              v_end := NULL;
    ELSE RAISE EXCEPTION 'Invalid p_timeframe: %', p_timeframe;
  END CASE;

  IF p_timeframe = 'day' THEN
    RETURN QUERY
      SELECT r.user_id, p.username, p.avatar_hue, r.score, r.completed_at
      FROM public.oublex_solo_results r
      JOIN public.profiles p ON p.id = r.user_id
      WHERE r.play_date = p_date
      ORDER BY r.score DESC, r.completed_at ASC
      LIMIT 10;
  ELSE
    RETURN QUERY
      SELECT
        r.user_id,
        p.username,
        p.avatar_hue,
        sum(r.score)::int         AS score,
        max(r.completed_at)       AS completed_at
      FROM public.oublex_solo_results r
      JOIN public.profiles p ON p.id = r.user_id
      WHERE (v_start IS NULL OR r.play_date >= v_start)
        AND (v_end   IS NULL OR r.play_date <  v_end)
      GROUP BY r.user_id, p.username, p.avatar_hue
      ORDER BY sum(r.score) DESC, max(r.completed_at) ASC
      LIMIT 10;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.oublex_solo_leaderboard(text, date) FROM public;
GRANT EXECUTE ON FUNCTION public.oublex_solo_leaderboard(text, date) TO authenticated;

-- ── My rank for the active window ────────────────────────────
-- CTE column names are aliased to avoid colliding with the
-- RETURNS TABLE OUT params (Postgres will throw "column reference
-- 'score' is ambiguous" otherwise — bitten by this in Yahdle c92).
CREATE OR REPLACE FUNCTION public.oublex_solo_my_rank(
  p_timeframe text,
  p_date      date DEFAULT current_date
)
RETURNS TABLE (rank int, score int)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_start date;
  v_end   date;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  CASE p_timeframe
    WHEN 'day'   THEN v_start := p_date;                            v_end := p_date + 1;
    WHEN 'week'  THEN v_start := date_trunc('week',  p_date)::date; v_end := v_start + 7;
    WHEN 'month' THEN v_start := date_trunc('month', p_date)::date; v_end := (v_start + interval '1 month')::date;
    WHEN 'all'   THEN v_start := NULL;                              v_end := NULL;
    ELSE RAISE EXCEPTION 'Invalid p_timeframe: %', p_timeframe;
  END CASE;

  IF p_timeframe = 'day' THEN
    RETURN QUERY
      WITH ranked AS (
        SELECT
          r.user_id            AS uid,
          r.score              AS user_score,
          rank() OVER (ORDER BY r.score DESC, r.completed_at ASC) AS rk
        FROM public.oublex_solo_results r
        WHERE r.play_date = p_date
      )
      SELECT rk::int, user_score::int
      FROM ranked
      WHERE uid = v_uid;
  ELSE
    RETURN QUERY
      WITH totals AS (
        SELECT
          r.user_id            AS uid,
          sum(r.score)::int    AS total_score,
          max(r.completed_at)  AS latest
        FROM public.oublex_solo_results r
        WHERE (v_start IS NULL OR r.play_date >= v_start)
          AND (v_end   IS NULL OR r.play_date <  v_end)
        GROUP BY r.user_id
      ),
      ranked AS (
        SELECT
          uid,
          total_score,
          rank() OVER (ORDER BY total_score DESC, latest ASC) AS rk
        FROM totals
      )
      SELECT rk::int, total_score::int
      FROM ranked
      WHERE uid = v_uid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.oublex_solo_my_rank(text, date) FROM public;
GRANT EXECUTE ON FUNCTION public.oublex_solo_my_rank(text, date) TO authenticated;
