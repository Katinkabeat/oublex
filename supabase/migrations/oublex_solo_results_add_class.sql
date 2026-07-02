-- Add a nullable `class` column to daily solo results for balance analytics.
-- Rows written before this migration stay NULL (not backfillable — class wasn't
-- persisted). The client threads the chosen class (bard/mage/ranger/cleric) into
-- the result upsert going forward.
--
-- Deliberately NOT surfaced on the leaderboard: oublex_solo_leaderboard /
-- oublex_solo_my_rank never select this column, preserving the "class not shown
-- on leaderboard" design decision. This is for analytics only.
alter table public.oublex_solo_results
  add column if not exists class text;

comment on column public.oublex_solo_results.class is
  'Hero class chosen for the run (bard/mage/ranger/cleric); analytics only, never shown on leaderboard. NULL for rows written before 2026-07-02.';
