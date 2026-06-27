-- ============================================================
-- Oublex — Multiplayer (N-player: 2–4) schema + RPCs
--
-- Run in Supabase → SQL Editor → New Query. Safe to re-run
-- (idempotent: `create table if not exists`, `create or replace`,
-- drop-policy-first). Run this BEFORE oublex_admin_close_game.sql
-- (which assumes oublex_games / oublex_players already exist),
-- and alongside oublex_nudge.sql.
--
-- This is the GENERIC SideQuest multiplayer engine, ported from
-- Yahdle's N-player model. It gives you, out of the box:
--   • 2–4 player games (max_players), open or friend-invited
--     (single + multi via invited_user_ids uuid[])
--   • auto-start when every seat fills
--   • modulo turn rotation: next seat = (current_player_idx + 1) % N,
--     skipping forfeited seats
--   • top-score-group-wins finalize (sole top = win; tied top = all win;
--     ties are NOT recorded — a tie-for-first reads as a win for each)
--   • forfeit-continue (a player drops out, the rest play on; the game
--     ends only when ≤1 active player remains — last one standing wins)
--   • claim-inactive-win after 7 days of no turn activity
--   • per-pair win/loss matchup record
--   • is_participant() + N-player RLS read policies
--   • realtime publication, invite expiry, oublex_pending_for(uid)
--
-- ── GAME-SPECIFIC TODO ───────────────────────────────────────
-- The turn ENGINE is generic, but how a turn earns points is your
-- game. This file ships a STUB turn-submit RPC,
--   oublex_submit_turn(p_game_id uuid, p_score int)
-- that just adds a passed-in integer to the caller's total_score and
-- advances the turn. It exists so the scaffold is playable end-to-end
-- (turns rotate, the game finishes, a winner is picked) BEFORE you
-- build real gameplay. Replace p_score with your real move payload +
-- server-side validation. See the big comment on that function below.
--
-- Status enum: waiting → active → finished. Matches
-- oublex_admin_close_game.sql.
-- ============================================================

-- ── 1. oublex_games ─────────────────────────────────────────
create table if not exists public.oublex_games (
  id                  uuid        primary key default gen_random_uuid(),
  status              text        not null default 'waiting'
                                  check (status in ('waiting','active','finished')),
  created_by          uuid        not null references auth.users(id) on delete cascade,
  -- Legacy singular column, kept + mirrored from the first invitee so
  -- the opponent_joined push trigger + older queries keep working.
  invited_user_id     uuid        references auth.users(id) on delete cascade,
  -- N-player multi-invite. NULL for a fully-open game.
  invited_user_ids    uuid[],
  max_players         int         not null default 2
                                  check (max_players between 2 and 4),
  current_player_idx  int         not null default 0,
  current_turn        int         not null default 1,
  winner_user_id      uuid        references auth.users(id),
  forfeit_user_id     uuid        references auth.users(id),
  -- Why the game ended: 'claim' | 'forfeit' (NULL for normal completion +
  -- admin-close). Lets the game_finished push word a claim vs a forfeit.
  end_reason          text,
  is_tie              boolean     not null default false,
  -- Set when the expire sweep CLOSES a never-filled game (only the creator
  -- was seated). 'no_other_players' renders as a "🚫 Game closed / invite
  -- expired" entry in Completed instead of a silent delete. (c150 policy)
  closed_reason       text,
  created_at          timestamptz not null default now(),
  joined_at           timestamptz,
  finished_at         timestamptz,
  last_activity_at    timestamptz not null default now(),
  last_nudged_at      timestamptz,
  expires_at          timestamptz not null default (now() + interval '7 days')
);

-- current_player_idx must be a valid seat for the player count.
do $$ begin
  alter table public.oublex_games
    add constraint oublex_games_current_player_idx_chk
    check (current_player_idx >= 0 and current_player_idx < max_players);
exception when duplicate_object then null; end $$;

create index if not exists oublex_games_status_idx        on public.oublex_games(status);
create index if not exists oublex_games_created_by_idx    on public.oublex_games(created_by);
create index if not exists oublex_games_invited_user_idx  on public.oublex_games(invited_user_id);
create index if not exists oublex_games_last_activity_idx on public.oublex_games(last_activity_at desc);
create index if not exists oublex_games_expires_at_idx    on public.oublex_games(expires_at) where status = 'waiting';

-- ── 1b. Invite-permission enforcement (per-game invitability, c200) ──
-- Honour the invitee's "who can invite me" preference for THIS game.
-- Reuses the hub's shared array-invitee trigger fn; the app key passed
-- here is what sq_check_invitable looks up in profiles.invite_prefs
-- (falling back to the global setting). This makes enforcement automatic
-- for every scaffolded game — no separate step. Requires the hub
-- migration sq_invite_prefs.sql to have run on the project.
drop trigger if exists oublex_check_invitable on public.oublex_games;
create trigger oublex_check_invitable
  before insert on public.oublex_games
  for each row
  execute function public.sq_invite_check_array_trigger('oublex');

-- ── 2. oublex_players ───────────────────────────────────────
-- One row per player per game.
--   total_score : the player's running score (the stub turn RPC adds to it).
--   turns_taken : how many turns this player has completed. Drives the
--                 "everyone is done" check + per-seat current_turn display.
--                 GENERIC: replace the meaning if your game isn't turn-capped.
--   forfeited   : player dropped out; skipped in rotation + excluded from win.
--   is_winner   : set at finalize (top-score group).
--
-- GAME-SPECIFIC: add your own per-player columns here (e.g. a board jsonb,
-- a hand, a per-turn result) as your gameplay needs them.
create table if not exists public.oublex_players (
  id              uuid    primary key default gen_random_uuid(),
  game_id         uuid    not null references public.oublex_games(id) on delete cascade,
  user_id         uuid    not null references auth.users(id)            on delete cascade,
  player_index    int     not null check (player_index between 0 and 3),
  total_score     int     not null default 0,
  turns_taken     int     not null default 0,
  forfeited       boolean not null default false,
  is_winner       boolean not null default false,
  joined_at       timestamptz default now(),
  unique (game_id, user_id),
  unique (game_id, player_index)
);

create index if not exists oublex_players_user_idx on public.oublex_players(user_id);

-- Realtime needs replica identity full for filters on non-PK columns
-- (the lobby + game page filter oublex_players on game_id / user_id).
alter table public.oublex_players replica identity full;

-- ── 3. oublex_matchups ──────────────────────────────────────
-- Per-pair W/L totals (one row per ordered (player, opponent) pair).
-- GENERIC head-to-head record; keep it or drop it if your game doesn't
-- care about rivalry stats. Ties are never recorded (a tie-for-first is
-- a win for each tied player).
create table if not exists public.oublex_matchups (
  player_id    uuid    not null references auth.users(id) on delete cascade,
  opponent_id  uuid    not null references auth.users(id) on delete cascade,
  wins         int     not null default 0,
  losses       int     not null default 0,
  ties         int     not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (player_id, opponent_id)
);

-- ── 4. Config helpers ─────────────────────────────────────────
-- GAME-SPECIFIC: how many turns each player takes before the game is
-- over. The stub ships with 1 (one submit each → game finishes) so the
-- scaffold is quick to exercise. Bump this (e.g. 12 like Yahdle) once
-- your real gameplay defines a turn count, or rework the "everyone done"
-- check in oublex_advance_turn if your game ends a different way.
create or replace function public.oublex_total_turns()
returns int language sql immutable as $$ select 1 $$;

-- ── 5. RLS ────────────────────────────────────────────────────
alter table public.oublex_games    enable row level security;
alter table public.oublex_players  enable row level security;
alter table public.oublex_matchups enable row level security;

-- SECURITY DEFINER membership check — reads oublex_players directly so
-- the games<->players read policies don't recurse into each other.
create or replace function public.oublex_is_participant(p_game_id uuid, p_uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.oublex_players
     where game_id = p_game_id and user_id = p_uid
  );
$$;
revoke all on function public.oublex_is_participant(uuid, uuid) from public;
grant execute on function public.oublex_is_participant(uuid, uuid) to authenticated;

drop policy if exists "oublex_games read participant"   on public.oublex_games;
drop policy if exists "oublex_games read open"          on public.oublex_games;
drop policy if exists "oublex_games insert as creator"  on public.oublex_games;
drop policy if exists "oublex_players read participant"  on public.oublex_players;
drop policy if exists "oublex_matchups read own"        on public.oublex_matchups;

-- Games: readable to the creator, any invitee (singular or array), and
-- any seated player. All mutations go through the SECDEF RPCs below
-- (no direct UPDATE policy) so game logic stays server-side.
create policy "oublex_games read participant" on public.oublex_games
  for select using (
    auth.uid() = created_by
    or auth.uid() = invited_user_id
    or auth.uid() = any(coalesce(invited_user_ids, '{}'))
    or public.oublex_is_participant(id, auth.uid())
  );

-- Any waiting game is publicly readable so the lobby can list open +
-- partially-filled games to potential joiners.
create policy "oublex_games read open" on public.oublex_games
  for select using (status = 'waiting');

create policy "oublex_games insert as creator" on public.oublex_games
  for insert with check (auth.uid() = created_by);

-- Players: any seated participant can read every player row in the game.
create policy "oublex_players read participant" on public.oublex_players
  for select using ( public.oublex_is_participant(game_id, auth.uid()) );

-- Matchups: each player reads their own rows.
create policy "oublex_matchups read own" on public.oublex_matchups
  for select using (auth.uid() = player_id);

-- ── 6. last_activity_at trigger ───────────────────────────────
-- Keeps oublex_games.last_activity_at fresh on any player write so
-- "claim inactive win" + nudge can use it as the turn-start proxy.
-- NOTE: nudge stamps last_nudged_at directly on oublex_games (not via
-- a player write), so it does NOT bump last_activity_at — keeping the
-- turn-age gate accurate.
create or replace function public.oublex_touch_game_activity()
returns trigger language plpgsql security definer as $$
begin
  update public.oublex_games
  set last_activity_at = now()
  where id = coalesce(new.game_id, old.game_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists oublex_players_touch_activity on public.oublex_players;
create trigger oublex_players_touch_activity
  after insert or update on public.oublex_players
  for each row execute function public.oublex_touch_game_activity();

-- ── 7. Invite expiry (SQ baseline policy — c150/c151/c152) ────
-- SQ standard: open game (no invitee) → 7 days; friend invite → 3 days.
create or replace function public.oublex_set_game_expiry()
returns trigger language plpgsql as $$
begin
  if new.expires_at is null or tg_op = 'INSERT' then
    if new.invited_user_id is null
       and coalesce(array_length(new.invited_user_ids, 1), 0) = 0 then
      new.expires_at := coalesce(new.created_at, now()) + interval '7 days';
    else
      new.expires_at := coalesce(new.created_at, now()) + interval '3 days';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists oublex_set_game_expiry on public.oublex_games;
create trigger oublex_set_game_expiry
  before insert on public.oublex_games
  for each row execute function public.oublex_set_game_expiry();

-- Expire sweep — NEVER a silent delete (the old behaviour permanently
-- vanished games people were waiting in). Per waiting game past expiry:
--   • >= 2 players joined  → drop the no-show invitee slots, shrink
--     max_players to who's actually here, and START the game short-handed.
--     invited_user_ids is KEPT on the row so the game page can render the
--     no-shows as greyed ✗ pills. No push (the pills are the signal).
--   • only the creator (1) → CLOSE (not delete): status='finished' +
--     closed_reason='no_other_players', no winner, and we deliberately do
--     NOT call oublex_finalize_game, so it records NO matchups / stats.
--     The lone creator gets one 'game_closed' push.
-- Still cheap + idempotent; the lobby calls it on a throttle. Returns the
-- number of games processed.
create or replace function public.oublex_expire_stale_invites()
returns int language plpgsql security definer as $$
declare
  g        record;
  v_joined int;
  n        int := 0;
begin
  -- Suppress the "opponent joined" push for the short-handed auto-starts
  -- below (txn-local; read back in oublex_notify_opponent_joined).
  perform set_config('oublex.suppress_join_push', '1', true);

  for g in
    select * from public.oublex_games
     where status = 'waiting' and expires_at < now()
     for update
  loop
    select count(*) into v_joined from public.oublex_players where game_id = g.id;

    if v_joined >= 2 then
      -- Playable short-handed. Joined players always hold contiguous
      -- player_index 0..v_joined-1, so shrinking max_players keeps the
      -- current_player_idx constraint satisfied.
      update public.oublex_games
         set max_players        = v_joined,
             status             = 'active',
             joined_at          = now(),
             current_player_idx = floor(random() * v_joined)::int,
             current_turn       = 1,
             last_activity_at   = now()
       where id = g.id;
    else
      -- Unplayable — close with a reason instead of deleting. Skips
      -- finalize, so no matchups/stats are touched.
      update public.oublex_games
         set status           = 'finished',
             finished_at      = now(),
             closed_reason    = 'no_other_players',
             winner_user_id   = null,
             is_tie           = false,
             last_activity_at = now()
       where id = g.id;

      -- One push to the lone creator (the only notification in this flow).
      perform public.oublex_notify_event(
        'game_closed',
        jsonb_build_object(
          'id', g.id,
          'created_by', g.created_by,
          'closed_reason', 'no_other_players'
        )
      );
    end if;

    n := n + 1;
  end loop;

  return n;
end;
$$;
grant execute on function public.oublex_expire_stale_invites() to authenticated;

-- ── 8. Create game (open or 1+ invitees, 2–4 players) ─────────
-- invited_user_ids NULL/empty => an OPEN game any user can join (capped
-- at one open game waiting per creator). Otherwise reserve a seat per
-- invitee; any leftover seats fill from the open lobby.
create or replace function public.oublex_create_game(
  p_invited_user_ids uuid[] default null,
  p_max_players      int    default 2
) returns uuid language plpgsql security definer as $$
declare
  v_game_id    uuid;
  v_uid        uuid := auth.uid();
  v_open_count int;
  v_invited    uuid[] := coalesce(p_invited_user_ids, '{}');
  v_first      uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_max_players < 2 or p_max_players > 4 then raise exception 'Invalid player count'; end if;
  if v_uid = any(v_invited) then raise exception 'Invalid opponent'; end if;
  if coalesce(array_length(v_invited, 1), 0) >= p_max_players then
    raise exception 'Too many invitees for this player count';
  end if;

  -- Cap one fully-open game (no invitees) waiting per creator.
  if coalesce(array_length(v_invited, 1), 0) = 0 then
    select count(*) into v_open_count from public.oublex_games
     where created_by = v_uid and status = 'waiting'
       and coalesce(array_length(invited_user_ids, 1), 0) = 0;
    if v_open_count > 0 then
      raise exception 'You already have an open game waiting for someone to join';
    end if;
  end if;

  -- Legacy singular column points at the first invitee.
  v_first := case when coalesce(array_length(v_invited, 1), 0) = 0 then null else v_invited[1] end;

  insert into public.oublex_games (created_by, invited_user_id, invited_user_ids, max_players, status)
  values (v_uid, v_first, nullif(v_invited, '{}'), p_max_players, 'waiting')
  returning id into v_game_id;

  insert into public.oublex_players (game_id, user_id, player_index)
  values (v_game_id, v_uid, 0);

  return v_game_id;
end;
$$;
grant execute on function public.oublex_create_game(uuid[], int) to authenticated;

-- ── 9. Join (unified: open or invited) + auto-start ───────────
-- One entry point. Invitees may always take a seat; a non-invitee may
-- only take a seat that isn't reserved for a still-absent invitee.
-- Auto-starts (random first seat) when the last seat fills.
create or replace function public.oublex_join_game(
  p_game_id uuid
) returns void language plpgsql security definer as $$
declare
  v_uid     uuid := auth.uid();
  v_game    record;
  v_count   int;
  v_pending int;
  v_idx     int;
  v_invited uuid[];
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_game from public.oublex_games where id = p_game_id for update;
  if not found then raise exception 'Game not found'; end if;
  if v_game.status <> 'waiting' then raise exception 'Game already started or finished'; end if;

  perform 1 from public.oublex_players where game_id = p_game_id and user_id = v_uid;
  if found then raise exception 'Already in this game'; end if;

  select count(*) into v_count from public.oublex_players where game_id = p_game_id;
  if v_count >= v_game.max_players then raise exception 'Game is full'; end if;

  v_invited := coalesce(v_game.invited_user_ids, '{}');

  if not (v_uid = any(v_invited)) then
    -- reserved seats = invitees who haven't joined yet.
    select count(*) into v_pending
      from unnest(v_invited) iu
     where not exists (
       select 1 from public.oublex_players p
        where p.game_id = p_game_id and p.user_id = iu);
    if (v_count + v_pending) >= v_game.max_players then
      raise exception 'No open seats — remaining seats are reserved for invited players';
    end if;
  end if;

  v_idx := v_count;  -- next 0-based player_index
  insert into public.oublex_players (game_id, user_id, player_index)
  values (p_game_id, v_uid, v_idx);

  -- Keep the legacy singular column pointing at a real opponent so the
  -- opponent_joined push fires for the creator.
  update public.oublex_games
     set invited_user_id = coalesce(invited_user_id, v_uid),
         last_activity_at = now()
   where id = p_game_id;

  -- Auto-start when every seat is filled.
  if v_idx + 1 >= v_game.max_players then
    update public.oublex_games
       set status             = 'active',
           joined_at          = now(),
           current_player_idx = floor(random() * v_game.max_players)::int,
           current_turn       = 1,
           last_activity_at   = now()
     where id = p_game_id;
  end if;
end;
$$;
grant execute on function public.oublex_join_game(uuid) to authenticated;

-- Back-compat wrappers so the client can call either name.
create or replace function public.oublex_join_open_game(p_game_id uuid)
returns void language plpgsql security definer as $$
begin perform public.oublex_join_game(p_game_id); end; $$;
grant execute on function public.oublex_join_open_game(uuid) to authenticated;

create or replace function public.oublex_accept_invite(p_game_id uuid)
returns void language plpgsql security definer as $$
declare v_game record;
begin
  select * into v_game from public.oublex_games where id = p_game_id;
  if not found then raise exception 'Game not found'; end if;
  if not (auth.uid() = any(coalesce(v_game.invited_user_ids, '{}'))
          or auth.uid() = v_game.invited_user_id) then
    raise exception 'Not your invite';
  end if;
  perform public.oublex_join_game(p_game_id);
end; $$;
grant execute on function public.oublex_accept_invite(uuid) to authenticated;

-- ── 10. Decline / cancel ──────────────────────────────────────
create or replace function public.oublex_decline_invite(p_game_id uuid)
returns void language plpgsql security definer as $$
begin
  -- An invitee removes themselves from the invite list. If they were the
  -- only/last invitee the whole waiting game is dropped.
  update public.oublex_games
     set invited_user_ids = nullif(array_remove(coalesce(invited_user_ids, '{}'), auth.uid()), '{}'),
         invited_user_id  = case when invited_user_id = auth.uid() then null else invited_user_id end
   where id = p_game_id and status = 'waiting'
     and (auth.uid() = any(coalesce(invited_user_ids, '{}')) or invited_user_id = auth.uid());
  if not found then raise exception 'Invite not found'; end if;
end;
$$;
grant execute on function public.oublex_decline_invite(uuid) to authenticated;

-- Creator cancels their own waiting game before it starts.
create or replace function public.oublex_cancel_invite(p_game_id uuid)
returns void language plpgsql security definer as $$
begin
  delete from public.oublex_games
  where id = p_game_id and status = 'waiting' and created_by = auth.uid();
  if not found then raise exception 'Invite not found or already started'; end if;
end;
$$;
grant execute on function public.oublex_cancel_invite(uuid) to authenticated;

-- ── 11. Advance turn (modulo over N, skip forfeited) ──────────
-- Internal. Resets nothing game-specific (there's no shared turn-state
-- table in the generic engine); just rotates the seat + finalizes when
-- every active player has taken all their turns.
create or replace function public.oublex_advance_turn(p_game_id uuid)
returns void language plpgsql security definer as $$
declare
  v_game record; v_n int; v_total int := public.oublex_total_turns();
  v_next_idx int; v_next_taken int; v_all_done boolean;
  i int; v_cand int; v_found boolean;
begin
  select * into v_game from public.oublex_games where id = p_game_id for update;
  v_n := v_game.max_players;

  -- Done when every NON-forfeited player has taken all their turns.
  -- (bool_and over zero active rows is null → also finish.)
  select bool_and(p.turns_taken >= v_total)
    into v_all_done
    from public.oublex_players p where p.game_id = p_game_id and not p.forfeited;
  if v_all_done is not false then
    perform public.oublex_finalize_game(p_game_id);
    return;
  end if;

  -- Hand to the next NON-forfeited seat.
  v_found := false;
  for i in 1 .. v_n loop
    v_cand := (v_game.current_player_idx + i) % v_n;
    perform 1 from public.oublex_players
      where game_id = p_game_id and player_index = v_cand and not forfeited;
    if found then v_next_idx := v_cand; v_found := true; exit; end if;
  end loop;
  if not v_found then
    perform public.oublex_finalize_game(p_game_id);
    return;
  end if;

  select turns_taken into v_next_taken
    from public.oublex_players
   where game_id = p_game_id and player_index = v_next_idx;

  update public.oublex_games
     set current_player_idx = v_next_idx,
         current_turn       = v_next_taken + 1,
         last_activity_at   = now()
   where id = p_game_id;
end;
$$;

-- ── 12. Finalize (top-score group wins; quitters forced to lose) ─
-- p_forced_losers are excluded from the winner group regardless of
-- score (forfeit / claim-inactive). Forfeited players are excluded too.
-- Sole top score → single winner; tied top → all of them win (is_tie
-- flagged, winner_user_id null). Ties are never recorded in matchups.
create or replace function public.oublex_finalize_game(
  p_game_id       uuid,
  p_forced_losers uuid[] default '{}'
) returns void language plpgsql security definer as $$
declare
  v_max     int;
  v_winners int;
  v_winner  uuid;
  a record; b record;
begin
  select max(total_score) into v_max
    from public.oublex_players
   where game_id = p_game_id and not forfeited and not (user_id = any(p_forced_losers));

  update public.oublex_players
     set is_winner = (v_max is not null and total_score = v_max
                      and not forfeited and not (user_id = any(p_forced_losers)))
   where game_id = p_game_id;

  select count(*) into v_winners from public.oublex_players where game_id = p_game_id and is_winner;
  select user_id into v_winner from public.oublex_players where game_id = p_game_id and is_winner limit 1;

  update public.oublex_games
     set status         = 'finished',
         finished_at     = now(),
         winner_user_id  = case when v_winners = 1 then v_winner else null end,
         is_tie          = (v_winners > 1)
   where id = p_game_id;

  -- Pairwise matchups: top-group players record a win vs everyone else;
  -- everyone else (incl. forfeiters) records a loss. Never ties.
  for a in select user_id, is_winner from public.oublex_players where game_id = p_game_id loop
    for b in select user_id from public.oublex_players
              where game_id = p_game_id and user_id <> a.user_id loop
      insert into public.oublex_matchups (player_id, opponent_id, wins, losses, ties)
      values (a.user_id, b.user_id,
              case when a.is_winner then 1 else 0 end,
              case when a.is_winner then 0 else 1 end, 0)
      on conflict (player_id, opponent_id) do update set
        wins   = oublex_matchups.wins   + excluded.wins,
        losses = oublex_matchups.losses + excluded.losses,
        updated_at = now();
    end loop;
  end loop;
end;
$$;

-- ── 13. Submit a turn (GAME-SPECIFIC STUB) ────────────────────
-- !!! REPLACE THIS with your real move RPC. !!!
--
-- This stub exists ONLY so the scaffold is playable end-to-end before
-- you build gameplay: it verifies it's the caller's turn + the game is
-- active, adds the passed-in p_score to that player's total_score, bumps
-- their turns_taken, and advances the turn (which finalizes the game once
-- everyone is done). With oublex_total_turns() = 1, a 2-player game
-- finishes after each player submits once — enough to watch the whole
-- turn engine (rotation → finalize → winner) work.
--
-- GAME-SPECIFIC: replace p_score with your real move payload (a word, a
-- placement, a roll, a card, etc.) and do the scoring + validation
-- SERVER-SIDE here — never trust a client-supplied score in production.
-- A typical real version:
--   1. load the game + caller's player row (FOR UPDATE), assert turn,
--   2. validate the move against authoritative server state,
--   3. compute the score server-side, update total_score + your own
--      per-player gameplay columns,
--   4. bump turns_taken,
--   5. perform oublex_advance_turn(p_game_id).
create or replace function public.oublex_submit_turn(
  p_game_id uuid,
  p_score   int
) returns void language plpgsql security definer as $$
declare
  v_uid    uuid := auth.uid();
  v_game   record;
  v_player record;
begin
  select * into v_game from public.oublex_games where id = p_game_id for update;
  if not found or v_game.status <> 'active' then raise exception 'Game not active'; end if;

  select * into v_player from public.oublex_players
   where game_id = p_game_id and user_id = v_uid for update;
  if not found then raise exception 'Not a participant'; end if;
  if v_player.forfeited then raise exception 'You have left this game'; end if;
  if v_player.player_index <> v_game.current_player_idx then raise exception 'Not your turn'; end if;

  -- GAME-SPECIFIC: this trusts the client's p_score. Do real scoring here.
  update public.oublex_players
     set total_score = total_score + coalesce(p_score, 0),
         turns_taken = turns_taken + 1
   where id = v_player.id;

  perform public.oublex_advance_turn(p_game_id);
end;
$$;
grant execute on function public.oublex_submit_turn(uuid, int) to authenticated;

-- ── 14. Forfeit (mark out; others continue, ≤1 left → finish) ─
create or replace function public.oublex_forfeit_game(p_game_id uuid)
returns void language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid(); v_game record; v_me record; v_active int;
begin
  select * into v_game from public.oublex_games where id = p_game_id for update;
  if not found or v_game.status <> 'active' then raise exception 'Game not active'; end if;
  select * into v_me from public.oublex_players where game_id = p_game_id and user_id = v_uid;
  if not found then raise exception 'Not a participant'; end if;
  if v_me.forfeited then raise exception 'You already left this game'; end if;

  update public.oublex_players set forfeited = true, is_winner = false where id = v_me.id;
  update public.oublex_games set forfeit_user_id = v_uid, end_reason = 'forfeit', last_activity_at = now() where id = p_game_id;

  select count(*) into v_active from public.oublex_players where game_id = p_game_id and not forfeited;

  if v_active <= 1 then
    perform public.oublex_finalize_game(p_game_id);   -- last one standing wins
  elsif v_me.player_index = v_game.current_player_idx then
    perform public.oublex_advance_turn(p_game_id);    -- it was my turn → hand off
  end if;
end;
$$;
grant execute on function public.oublex_forfeit_game(uuid) to authenticated;

-- ── 15. Claim inactive win (boot idle current player, others continue) ─
create or replace function public.oublex_claim_inactive_win(p_game_id uuid)
returns void language plpgsql security definer as $$
declare
  v_uid uuid := auth.uid(); v_game record; v_me record; v_stalled record; v_active int;
begin
  select * into v_game from public.oublex_games where id = p_game_id for update;
  if not found or v_game.status <> 'active' then raise exception 'Game not active'; end if;
  select * into v_me from public.oublex_players where game_id = p_game_id and user_id = v_uid;
  if not found or v_me.forfeited then raise exception 'Not an active participant'; end if;
  if v_me.player_index = v_game.current_player_idx then raise exception 'It is your turn — you cannot claim'; end if;
  if v_game.last_activity_at > now() - interval '7 days' then raise exception 'Opponent still has time'; end if;

  select * into v_stalled from public.oublex_players
   where game_id = p_game_id and player_index = v_game.current_player_idx;
  update public.oublex_players set forfeited = true, is_winner = false where id = v_stalled.id;
  update public.oublex_games set forfeit_user_id = v_stalled.user_id, end_reason = 'claim', last_activity_at = now() where id = p_game_id;

  select count(*) into v_active from public.oublex_players where game_id = p_game_id and not forfeited;
  if v_active <= 1 then
    perform public.oublex_finalize_game(p_game_id);
  else
    perform public.oublex_advance_turn(p_game_id);
  end if;
end;
$$;
grant execute on function public.oublex_claim_inactive_win(uuid) to authenticated;

-- ── 16. Rematch ───────────────────────────────────────────────
-- Spawns a fresh game inviting all the same players (minus the caller).
create or replace function public.oublex_rematch(p_game_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_uid     uuid := auth.uid();
  v_game    record;
  v_others  uuid[];
begin
  select * into v_game from public.oublex_games where id = p_game_id;
  if not found or v_game.status <> 'finished' then raise exception 'Original game not finished'; end if;
  if not public.oublex_is_participant(p_game_id, v_uid) then raise exception 'Not a participant'; end if;

  select array_agg(user_id) into v_others
    from public.oublex_players where game_id = p_game_id and user_id <> v_uid;

  return public.oublex_create_game(v_others, v_game.max_players);
end;
$$;
grant execute on function public.oublex_rematch(uuid) to authenticated;

-- ── 17. Open-game lobby list ──────────────────────────────────
-- Waiting games the caller can join: not created by them, not already
-- joined, and with a free seat that isn't reserved for an absent invitee.
drop function if exists public.oublex_list_open_games();
create or replace function public.oublex_list_open_games()
returns table(
  id                 uuid,
  created_by         uuid,
  created_at         timestamptz,
  expires_at         timestamptz,
  creator_username   text,
  creator_avatar_hue int,
  max_players        int,
  players_joined     int
) language sql security definer stable as $$
  with me as (select coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) as uid)
  select
    g.id, g.created_by, g.created_at, g.expires_at,
    p.username, p.avatar_hue, g.max_players,
    (select count(*)::int from public.oublex_players pl where pl.game_id = g.id) as players_joined
  from public.oublex_games g
  join public.profiles p on p.id = g.created_by
  cross join me
  where g.status = 'waiting'
    and g.created_by <> me.uid
    and g.expires_at > now()
    and not exists (select 1 from public.oublex_players pl where pl.game_id = g.id and pl.user_id = me.uid)
    and (
      (select count(*) from public.oublex_players pl where pl.game_id = g.id)
      + (select count(*) from unnest(coalesce(g.invited_user_ids, '{}')) iu
          where not exists (select 1 from public.oublex_players pl
                             where pl.game_id = g.id and pl.user_id = iu))
    ) < g.max_players
  order by g.created_at desc
  limit 50;
$$;
grant execute on function public.oublex_list_open_games() to authenticated;

-- ── 18. pending_for (hub bell counter) ────────────────────────
-- Must match the shape sq_pending_for expects: TABLE(count int, label
-- text, url text). One row per logical bucket.
drop function if exists public.oublex_pending_for(uuid);
create or replace function public.oublex_pending_for(uid uuid)
returns table(count int, label text, url text)
language sql security definer stable as $$
  with invites as (
    select count(*)::int as n from public.oublex_games
     where status = 'waiting'
       and (uid = any(coalesce(invited_user_ids, '{}')) or invited_user_id = uid)
       and not exists (select 1 from public.oublex_players p
                        where p.game_id = oublex_games.id and p.user_id = uid)
  ),
  turn as (
    select count(*)::int as n
      from public.oublex_games g
      join public.oublex_players p on p.game_id = g.id and p.user_id = uid
     where g.status = 'active' and p.player_index = g.current_player_idx and not p.forfeited
  )
  select n, 'Your turn'::text, '/oublex/'::text from turn where n > 0
  union all
  select n, 'Invite'::text, '/oublex/'::text from invites where n > 0
$$;
grant execute on function public.oublex_pending_for(uuid) to authenticated;

-- ── 19. Realtime publication ──────────────────────────────────
-- Required so MultiplayerCard + MultiGamePage receive live updates.
-- Wrapped so re-running this file doesn't error on "already member".
do $$ begin
  alter publication supabase_realtime add table public.oublex_games;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.oublex_players;
exception when duplicate_object then null; end $$;

-- ── 20. Push notification triggers ────────────────────────────
-- Feed the oublex-push-notification Edge Function via pg_net.
--   game_invited    : AFTER INSERT (invited_user_id set) → notify invitee(s)
--   opponent_joined : AFTER UPDATE waiting→active        → notify creator
--   turn_change     : AFTER UPDATE current_player_idx     → notify new player
--   game_finished   : AFTER UPDATE active→finished        → notify all players
--   game_closed     : emitted from oublex_expire_stale_invites when a
--                     never-filled game is closed → notify lone creator
--
-- BEFORE THIS WORKS you MUST replace the two placeholders below with
-- YOUR project's values (search for "REPLACE"):
--   • <PROJECT_REF>  — your Supabase project ref (e.g. abcdefgh...).
--     The SQ shared project is yyhewndblruwxsrqzart.
--   • <ANON_JWT>     — your project's anon public JWT. The Edge Function
--     only needs a valid JWT to verify; it uses its own service-role key.
create or replace function public.oublex_notify_event(p_type text, p_new jsonb, p_old jsonb default null)
returns void language plpgsql security definer as $$
begin
  begin
    perform net.http_post(
      -- REPLACE <PROJECT_REF>:
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/oublex-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- REPLACE <ANON_JWT>:
        'Authorization', 'Bearer <ANON_JWT>'
      ),
      body := jsonb_strip_nulls(jsonb_build_object(
        'type', p_type,
        'record', p_new,
        'old_record', p_old
      ))
    );
  exception when others then
    raise warning 'Oublex % push trigger failed: %', p_type, SQLERRM;
  end;
end;
$$;

create or replace function public.oublex_notify_game_invited()
returns trigger language plpgsql security definer as $$
begin
  if NEW.invited_user_id is null and coalesce(array_length(NEW.invited_user_ids, 1), 0) = 0 then
    return NEW;
  end if;
  perform public.oublex_notify_event('game_invited', row_to_json(NEW)::jsonb);
  return NEW;
end;
$$;
drop trigger if exists on_oublex_game_invited on public.oublex_games;
create trigger on_oublex_game_invited
  after insert on public.oublex_games
  for each row
  when (NEW.invited_user_id is not null or NEW.invited_user_ids is not null)
  execute function public.oublex_notify_game_invited();

create or replace function public.oublex_notify_opponent_joined()
returns trigger language plpgsql security definer as $$
begin
  -- The expire sweep flips waiting→active for a short-handed start, which
  -- would otherwise fire this push. Rae wants NO push then (the greyed ✗
  -- no-show pills are the signal), so skip when the sweep set the guard.
  if coalesce(current_setting('oublex.suppress_join_push', true), '') = '1' then
    return NEW;
  end if;
  perform public.oublex_notify_event('opponent_joined', row_to_json(NEW)::jsonb);
  return NEW;
end;
$$;
drop trigger if exists on_oublex_opponent_joined on public.oublex_games;
create trigger on_oublex_opponent_joined
  after update on public.oublex_games
  for each row
  when (OLD.status = 'waiting' and NEW.status = 'active')
  execute function public.oublex_notify_opponent_joined();

create or replace function public.oublex_notify_turn_change()
returns trigger language plpgsql security definer as $$
begin
  perform public.oublex_notify_event('turn_change', row_to_json(NEW)::jsonb, row_to_json(OLD)::jsonb);
  return NEW;
end;
$$;
drop trigger if exists on_oublex_turn_change on public.oublex_games;
create trigger on_oublex_turn_change
  after update on public.oublex_games
  for each row
  when (
    NEW.status = 'active' and OLD.status = 'active'
    and OLD.current_player_idx is distinct from NEW.current_player_idx
  )
  execute function public.oublex_notify_turn_change();

create or replace function public.oublex_notify_game_finished()
returns trigger language plpgsql security definer as $$
begin
  perform public.oublex_notify_event('game_finished', row_to_json(NEW)::jsonb);
  return NEW;
end;
$$;
drop trigger if exists on_oublex_game_finished on public.oublex_games;
create trigger on_oublex_game_finished
  after update on public.oublex_games
  for each row
  when (OLD.status = 'active' and NEW.status = 'finished' and NEW.end_reason is not null)
  execute function public.oublex_notify_game_finished();
