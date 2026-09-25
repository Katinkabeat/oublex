-- ============================================================
-- Oublex — Test Accounts group (card c332)
--
-- Members of the shared "test-accounts" group (public.sq_is_test_account /
-- public.sq_test_account_ids, already live) get three carve-outs here:
--
--   1. Solo leaderboard/rank never surface a member's result. Excluded
--      inside oublex_solo_leaderboard's day AND window branches, and the
--      matching branches of oublex_solo_my_rank, so a member never
--      occupies a rank slot. If the caller IS a member, their row is
--      excluded from the ranked CTE too, so oublex_solo_my_rank just
--      returns nothing for them — there's no rank to report.
--
--   2. Daily replay: a member may replay today's dungeon as often as
--      they like; each finished run OVERWRITES that day's row (latest
--      run wins). Everyone else keeps the existing "first result wins"
--      ON CONFLICT DO NOTHING behaviour in oublex_record_solo_result,
--      completely unchanged. Membership is re-checked server-side on
--      every call — never trust the client's cached flag.
--
--      Getting a member back to a FRESH run (rather than re-viewing the
--      day's now-stale result / resuming an old snapshot) needs a second
--      piece: oublex_test_reset_today() below, a SECDEF RPC that deletes
--      the caller's own oublex_solo_results row for today AND their
--      oublex_daily_runs snapshot for today — but ONLY for a test-account
--      member (raises for anyone else). This backs the "Replay (test
--      account)" button on SoloGamePage's already-played screen; the
--      client then resets its local state and starts a brand-new run,
--      which flows through oublex_record_solo_result normally on finish
--      (and so overwrites, per the branch added there).
--
--      NOTE: the old admin "reset today" self-delete policy
--      (oublex_solo_admin_reset.sql) was deliberately dropped by c237's
--      write guard (oublex_solo_results_write_guard.sql) to close the
--      replay-farm hole — this RPC does NOT reinstate that policy. It's a
--      narrow, membership-gated, SECDEF-only path; direct delete from the
--      client is still impossible.
--
--   3. Multiplayer: oublex's multiplayer engine is scaffolding only —
--      nothing in the app reads oublex_matchups and none of its RPCs
--      (oublex_finalize_game etc.) are deployed to this project yet. Its
--      c332 exclusion (skip matchup writes when a member is seated) is
--      patched directly into the repo source at
--      supabase/migrations/oublex_multiplayer.sql instead of shipped as a
--      DB migration here — there is nothing live to migrate.
-- ============================================================

-- ── 1. Solo leaderboard — exclude members ─────────────────────
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
        AND NOT public.sq_is_test_account(r.user_id)  -- c332
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
        AND NOT public.sq_is_test_account(r.user_id)  -- c332
      GROUP BY r.user_id, p.username, p.avatar_hue
      ORDER BY sum(r.score) DESC, max(r.completed_at) ASC
      LIMIT 10;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.oublex_solo_leaderboard(text, date) FROM public;
GRANT EXECUTE ON FUNCTION public.oublex_solo_leaderboard(text, date) TO authenticated;

-- ── 2. My rank — same exclusion, identical tie-break ──────────
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
          AND NOT public.sq_is_test_account(r.user_id)  -- c332: a member never
          -- occupies a rank slot; if the caller IS a member this also means
          -- `uid = v_uid` below matches nothing, so they get an empty result.
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
          AND NOT public.sq_is_test_account(r.user_id)  -- c332
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

-- ── 3. Record solo result — members overwrite, everyone else unchanged ─
CREATE OR REPLACE FUNCTION public.oublex_record_solo_result(
  p_play_date date,
  p_score     int,
  p_class     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today   date := (timezone('America/Halifax', now()))::date;
  v_uid     uuid := auth.uid();
  v_is_test boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'oublex_record_solo_result: not authenticated';
  END IF;

  -- The guard. A result may only be recorded for the current Atlantic day.
  IF p_play_date <> v_today THEN
    RAISE EXCEPTION 'oublex_record_solo_result: play_date % is not today (%); past/future writes are not allowed', p_play_date, v_today;
  END IF;

  -- c332: test-account members may replay the daily as many times as they
  -- like; each finished run OVERWRITES that day's row. Re-checked here,
  -- server-side, on every call — the client's replay button is convenience
  -- only.
  v_is_test := public.sq_is_test_account(v_uid);

  IF v_is_test THEN
    INSERT INTO public.oublex_solo_results (user_id, play_date, score, class, completed_at)
    VALUES (v_uid, p_play_date, p_score, p_class, now())
    ON CONFLICT (user_id, play_date) DO UPDATE SET
      score        = EXCLUDED.score,
      class        = EXCLUDED.class,
      completed_at = EXCLUDED.completed_at;
  ELSE
    -- One attempt per day: first finished result wins (unchanged).
    INSERT INTO public.oublex_solo_results (user_id, play_date, score, class, completed_at)
    VALUES (v_uid, p_play_date, p_score, p_class, now())
    ON CONFLICT (user_id, play_date) DO NOTHING;
  END IF;

  -- Finished run: drop the in-progress snapshot either way.
  DELETE FROM public.oublex_daily_runs
   WHERE user_id = v_uid AND play_date = p_play_date;
END;
$$;

REVOKE ALL ON FUNCTION public.oublex_record_solo_result(date, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.oublex_record_solo_result(date, int, text) TO authenticated;

-- ── 4. Test-account daily reset ────────────────────────────────
-- Deletes the caller's OWN oublex_solo_results row for today AND their
-- oublex_daily_runs snapshot for today, but ONLY if they're a
-- test-account member — checked server-side on every call, never
-- trusting the client's cached membership flag. Backs the "Replay (test
-- account)" button on SoloGamePage's already-played screen; the client
-- then resets its local state and starts a fresh run through the normal
-- flow, which records via oublex_record_solo_result on finish (and so
-- overwrites, per the branch above).
CREATE OR REPLACE FUNCTION public.oublex_test_reset_today()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_today date := (timezone('America/Halifax', now()))::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'oublex_test_reset_today: not authenticated';
  END IF;

  IF NOT public.sq_is_test_account(v_uid) THEN
    RAISE EXCEPTION 'oublex_test_reset_today: caller is not a test account';
  END IF;

  DELETE FROM public.oublex_solo_results
   WHERE user_id = v_uid AND play_date = v_today;

  DELETE FROM public.oublex_daily_runs
   WHERE user_id = v_uid AND play_date = v_today;
END;
$$;

REVOKE ALL ON FUNCTION public.oublex_test_reset_today() FROM public;
GRANT EXECUTE ON FUNCTION public.oublex_test_reset_today() TO authenticated;
