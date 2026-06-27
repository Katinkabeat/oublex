-- ============================================================
-- Oublex — Solo results table
--
-- One row per finished solo session. The c92 leaderboard RPCs
-- (see oublex_solo_leaderboards.sql) read from this table; if
-- your game uses a different table shape (e.g. timestamptz-only
-- like Rungles, or per-day puzzle feed like Snibble), adapt the
-- columns AND update the RPCs to match before applying.
--
-- The default shape matches Yahdle/Snibble: one play per user per
-- day, with play_date for cheap day-bucketing and completed_at
-- for tie-break.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oublex_solo_results (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  play_date    date        NOT NULL,
  score        int         NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, play_date)
);

CREATE INDEX IF NOT EXISTS oublex_solo_results_score_idx
  ON public.oublex_solo_results (play_date, score DESC, completed_at ASC);

ALTER TABLE public.oublex_solo_results ENABLE ROW LEVEL SECURITY;

-- Each user can insert/update their own rows only.
CREATE POLICY oublex_solo_results_insert_own ON public.oublex_solo_results
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY oublex_solo_results_update_own ON public.oublex_solo_results
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- All authenticated users can read (needed for the leaderboard).
-- The leaderboard RPCs are SECDEF anyway; this just enables direct
-- reads (e.g. for a "my history" view).
CREATE POLICY oublex_solo_results_select_all ON public.oublex_solo_results
  FOR SELECT TO authenticated
  USING (true);
