-- ============================================================
-- Oublex — played_daily check function for the hub daily-reminder
-- registry (sq_unplayed_dailies). Returns true iff the user has a
-- completed solo daily (oublex_solo_results row) for the given
-- Atlantic-date ymd. Mirrors yahdle_played_daily / snibble_played_daily.
--
-- Read oublex_solo_results (finished runs), NOT oublex_daily_runs
-- (in-progress snapshots, deleted on completion).
-- ============================================================

create or replace function public.oublex_played_daily(uid uuid, ymd date)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.oublex_solo_results
    where user_id = uid and play_date = ymd
  );
$$;

grant execute on function public.oublex_played_daily(uuid, date)
  to authenticated, service_role;
