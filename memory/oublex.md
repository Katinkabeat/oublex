# Oublex session memory

Per the SQ session memory convention, update this file at the end of every
Oublex work session with: what changed, what's pending, and any gotchas.

## Game overview

A daily word-dungeon crawl

- Slug: `oublex`
- Deploys to: https://katinkabeat.github.io/oublex/
- Theme color: `#7c3aed`
- Background color: `#faf5ff`

## Multiplayer (baked in)

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
