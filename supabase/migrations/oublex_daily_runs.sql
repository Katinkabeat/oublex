-- In-progress daily run state, so a player who reloads or comes back mid-run
-- RESUMES the same run instead of getting a fresh roll of the same seed (the
-- old replay hole). Mirrors Snibble's sn_daily_feeds approach: DB-backed (not
-- localStorage) so it's cross-device safe and server-authoritative.
--
-- Kept SEPARATE from oublex_solo_results on purpose: results = finished runs
-- only (what the leaderboard + Rook read). This table holds the transient
-- snapshot of an unfinished run; it's deleted when the run ends.
--
-- run_state is a full OublexRun snapshot (see OublexRun.snapshot() in
-- oublexEngine.js): phase, class, room, HP, the resolved rooms, rack, RNG
-- position, cumulative damage, etc. Stored as jsonb so the shape can evolve
-- (the snapshot carries a version field `v`).
--
-- NOTE (residual replay hole, deferred to c237): delete-own is granted so the
-- game-over cleanup + admin reset work client-side, mirroring Snibble. That
-- means a determined user could DELETE their own in-progress row via the API to
-- force a fresh roll. The honest reload / casual replay cases are closed; the
-- server-side write-guard that closes the API path is c237's job (the same card
-- that adds midnight auto-submit).
create table if not exists public.oublex_daily_runs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  play_date  date not null,               -- Atlantic-time calendar date (the daily seed)
  run_state  jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, play_date)
);

alter table public.oublex_daily_runs enable row level security;

create policy oublex_daily_runs_select_own on public.oublex_daily_runs
  for select to authenticated using (auth.uid() = user_id);
create policy oublex_daily_runs_insert_own on public.oublex_daily_runs
  for insert to authenticated with check (auth.uid() = user_id);
create policy oublex_daily_runs_update_own on public.oublex_daily_runs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy oublex_daily_runs_delete_own on public.oublex_daily_runs
  for delete to authenticated using (auth.uid() = user_id);
