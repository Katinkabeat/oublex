-- ============================================================
-- Oublex — server-side write guard for solo daily results (c237)
--
-- Closes TWO cheats on the daily dungeon:
--
--  1. Past-board padding. The daily leaderboard ungates past days (the
--     c92 decision), so after local midnight (America/Halifax) yesterday's
--     board is readable. oublex_solo_results was written by a direct client
--     upsert whose play_date came from the route param, guarded only by a
--     "write your own rows" RLS policy with NO date check — so a player who
--     left yesterday's run open could submit a padded score onto yesterday.
--
--  2. Seed re-roll farming (the c93 residual). oublex_daily_runs holds the
--     in-progress run snapshot so a reload RESUMES rather than re-rolls the
--     same seed. But delete-own was granted (for the client game-over
--     cleanup), so a determined user could DELETE their in-progress row via
--     the API to force a fresh roll and retry the daily until it went well.
--
-- Fix: a SECURITY DEFINER record RPC is the only writer of results; it
-- rejects any non-today play_date (past days immutable) AND performs the
-- snapshot cleanup itself, so the direct-write + delete RLS policies can all
-- be dropped. With delete gone, the re-roll farm is closed; with the date
-- guard, the padding is closed.
--
-- Note on the honest cross-midnight finisher: like Yahdle (and unlike
-- Snibble, which banks progress incrementally), Oublex records only the
-- final result, so a strict today-only guard means a run finished after its
-- day ended isn't recorded. Rare for a one-sitting dungeon; the run still
-- shows its result in-session, it just doesn't hit the board.
-- ============================================================

create or replace function public.oublex_record_solo_result(
  p_play_date date,
  p_score     int,
  p_class     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('America/Halifax', now()))::date;
  v_uid   uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'oublex_record_solo_result: not authenticated';
  end if;

  -- The guard. A result may only be recorded for the current Atlantic day.
  if p_play_date <> v_today then
    raise exception 'oublex_record_solo_result: play_date % is not today (%); past/future writes are not allowed', p_play_date, v_today;
  end if;

  -- One attempt per day: first finished result wins (matches the old
  -- ignoreDuplicates upsert). A later call for the same day is a no-op.
  insert into public.oublex_solo_results (user_id, play_date, score, class, completed_at)
  values (v_uid, p_play_date, p_score, p_class, now())
  on conflict (user_id, play_date) do nothing;

  -- Finished run: drop the in-progress snapshot. Doing this here (SECDEF)
  -- instead of client-side is what lets us remove delete-own below, closing
  -- the "delete my in-progress row to re-roll the seed" farm.
  delete from public.oublex_daily_runs
   where user_id = v_uid and play_date = p_play_date;
end;
$$;

revoke all on function public.oublex_record_solo_result(date, int, text) from public;
grant execute on function public.oublex_record_solo_result(date, int, text) to authenticated;

-- ── Lock down oublex_solo_results to the RPC ──────────────────
-- Drop direct insert/update (no arbitrary-dated writes) AND delete-own
-- (the admin "reset today" button was removed in c243, so nothing legit
-- uses it; leaving it would let a user delete today's result to replay).
-- select_all stays (leaderboard / "already played" gate read it).
drop policy if exists oublex_solo_results_insert_own on public.oublex_solo_results;
drop policy if exists oublex_solo_results_update_own on public.oublex_solo_results;
drop policy if exists oublex_solo_results_delete_own on public.oublex_solo_results;

-- ── Close the re-roll on oublex_daily_runs ────────────────────
-- Drop delete-own so an in-progress snapshot can't be wiped via the API to
-- force a fresh roll. Cleanup now happens inside the record RPC above.
-- insert/update-own stay (persistRun writes the snapshot each move); a new
-- snapshot written after a run is finished is harmless because the load path
-- checks oublex_solo_results FIRST ("finished run wins").
drop policy if exists oublex_daily_runs_delete_own on public.oublex_daily_runs;
