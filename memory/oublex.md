# Oublex session memory

Per the SQ session memory convention, update this file at the end of every
Oublex work session with: what changed, what's pending, and any gotchas.

## Game overview

A daily word-dungeon crawl

- Slug: `oublex`
- Deploys to: https://katinkabeat.github.io/oublex/
- Theme color: `#7c3aed`
- Background color: `#faf5ff`

## v1 is SOLO-ONLY (daily dungeon)

Oublex v1 is a **solo daily** game — there is NO multiplayer in v1. `LobbyPage`
renders only `SoloPlayCard` (the MultiplayerCard + `useMultiplayerLobby` were
removed to stop missing-table errors), and the MP migrations were NOT applied.
The MP section below is for if/when MP is ever added.

## The solo game (built 2026-06-27/28)

- **Engine:** `src/lib/oublexEngine.js` — `OublexRun(gameId, dict)`, seeded per day
  via `rngFromSeed('oublex:daily:'+gameId)` (`src/lib/rng.js`). 5-room dungeon,
  spell words from a 7-tile rack (guaranteed >=2 vowels + >=2 consonants so it
  never dead-ends), 2-letter words legal, single-tile "runes" as a chip backstop.
  Bard class: a word with a doubled letter does x1.5. Loot 1-of-3 between rooms
  (wildcard / +20 HP / redraw). Score = HP remaining.
- **Monster curve A (rebalanced 2026-06-28):** HP 12/18/24/30/40, counter
  4/6/8/10/12. The original 15/25/35/50/80 + 8/10/12/15/20 was UNWINNABLE (damage
  sim: 0/20 wins). Curve A is sim-verified winnable (14/14). If retuning, re-run a
  best-word-per-turn + always-+20HP-loot sim before shipping.
- **UI:** `src/components/game/OublexGame.jsx` (uses sq-ui `.tile`/`.card`/`.btn-*`),
  mounted in `SoloGamePage.jsx`. Tiles use the shared `.tile` style, one-line rack,
  dim (not pink) on select; hero HP bar at top with a short Bard label.
- **Daily flow:** `SoloPlayCard` -> `/solo/<atlanticYMD>`. One attempt/day: a
  finished run upserts to `oublex_solo_results` (ignoreDuplicates); re-entering
  shows an "already delved" screen. KNOWN GAP: in-progress runs aren't persisted,
  so abandon-before-finish lets you replay the seed (hardening is a follow-up).
- **Dictionary:** `public/words.txt` (173k TWL list, Oublex's own copy to tune).
- **Admin reset tool:** admin-gated "Reset today" on the already-delved screen
  deletes the admin's own row (DELETE-own RLS, `oublex_solo_admin_reset.sql`) to
  replay for testing.
- **DB applied to shared prod:** `oublex_solo_results.sql`,
  `oublex_solo_leaderboards.sql`, `oublex_solo_admin_reset.sql`. (Seed test rows
  with the **Atlantic** play_date, not the DB's UTC `current_date`.)

## Multiplayer (baked in — DORMANT in v1)

The scaffold ships a working **N-player (2–4) multiplayer** engine ported
from Yahdle — open + friend-invited games, auto-start when seats fill,
modulo turn rotation, top-score-group-wins finalize, forfeit-continue,
claim-inactive-win, the 🔔 nudge feature, and all 6 push types.

It also bakes in the **SQ invite-expiry baseline** (c150/c151/c152): friend
invites expire in 3 days (open games 7); at expiry a game is never silently
deleted — ≥2 joined → drop no-show slots + start short-handed (greyed ✗
pills); creator-only → close with `closed_reason='no_other_players'` (shows
in Completed with an "invite expired" blurb, one `game_closed` push, no
stats). This is inherited, not game-specific — don't re-derive it.

Backend: `supabase/migrations/oublex_multiplayer.sql` (+ `oublex_nudge.sql`)
and `supabase/functions/oublex-push-notification/`.
Frontend: `lib/multiplayerActions.js`, `hooks/useMultiplayerLobby.js`,
`hooks/useFriends.js`, `components/lobby/{MultiplayerCard,CreateGameSheet}.jsx`,
`components/game/MultiGamePage.jsx`.

**Per-game customization points (the only game-specific bits):**

- `oublex_submit_turn(p_game_id, p_score)` in `oublex_multiplayer.sql`
  is a STUB that adds a client-supplied integer to `total_score` and
  advances the turn. Replace it with your real move RPC + server-side
  validation + scoring.
- The **GAME-SPECIFIC PLAY AREA** block in `MultiGamePage.jsx` is a demo
  number-input + "Submit turn" button wired to that stub. Replace it with
  your real board/dice/cards. (Also: the `OpponentSheet` inspector.)
- `oublex_total_turns()` (default `1`) defines how many turns each
  player takes before the game finalizes — bump it for your gameplay.
- Add your own per-player gameplay columns to `oublex_players` as needed.
- Push triggers need `<PROJECT_REF>` + `<ANON_JWT>` filled in.

## Session log

### 2026-06-27/28 — Named, built, gated-launched (solo v1)

Working title "Lexicon Quest" became **Oublex** (after the oubliette, the
forgetting-dungeon in Labyrinth). Built the full solo daily game, applied the
solo migrations to shared prod, authed-verified end to end, and **gated-launched**:
`games_catalog` row with `requires_access=true` (coming-soon to players, playable
for admins) + `/oublex/` added to the hub's `ALLOWED_RETURN_PREFIXES`. Repo
`Katinkabeat/oublex` created and deployed to GH Pages. Then added the admin
reset-day test tool, tile/layout/em-dash polish, and a balance fix (curve A) so
the dungeon is actually winnable.

Pending before the PUBLIC flip: narrative voice rework (Raven's copy reads too
AI), real how-to-play copy, one-attempt hardening, Rook integration, then flip
`requires_access=false`.

### 2026-06-27 — Scaffolded

- Created from `rae-side-quest/templates/sq-game-starter/`
- Pre-wired with sq-ui chrome, dual-header, Supabase auth bounce,
  theme-flash prevention, push-notification SW, GitHub Pages deploy.
- Pending follow-ups before launch:
  - Add to `rae-side-quest`'s `dev:all` script
  - Add to SQ hub landing page game grid + post-login allowlist
  - Wire into shared notification system
  - Update other games' theme-flash localStorage fallback to include `oublex-theme`
  - Build the actual game (lobby cards, board, scoring)
  - `gh repo create` + push
