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
  (wildcard / +20 HP / redraw). **Score = cumulative damage dealt** (sum of every
  cast's damage across the run; changed from HP-remaining 2026-06-28 to reward
  word skill). **Wildcard:** taking it adds an 8th `★` tile; tapping it opens a
  Wordy-style A–Z picker so the player chooses the letter it plays as (scores 0).
  It's consumed on cast — `refillSpent` drops a spent wild so the rack returns to
  7 (it is NOT refilled). Validation/scoring use `effLetter`/`tileValue` helpers.
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

**DESIGN DIRECTION (Rae, 2026-06-28): MP, if it ever ships, must be
COOPERATIVE (players team up against the dungeon, not against each other) and
HARDER than the solo daily** (tougher monster curve / more rooms / shared HP
pressure — exact knobs TBD). The baked-in scaffold below is the generic
COMPETITIVE Yahdle port, so it would need reworking, not just enabling.

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

### 2026-07-02 (post-launch) — Rook "Deathless" highlight

Added Oublex's game-specific #highlights cheer to Rook: **`oublex_deathless`**
fires when a linked player logs a 170+ damage run (the top "Deathless" clear-rank).
Detection keys on `oublex_solo_results.completed_at > p_since` + `score >= 170`
(clean append-only cursor). Wired in the Rook repo (config HYPE.enabled +
messages.hypeDeathless (2 variants, Rae picked) + hype.js renderEvent +
rook_hype.sql UNION + sq_set_hype_pref list); Rook commit `a6f6efb`, deployed +
verified (RPC emits the event, message renders). Caveat: the results table has no
win flag, so a rare death that racks up 170+ damage could also trigger it; 170 is
a high enough bar that it's an acceptable proxy.

### 2026-07-02 (launch) — Rook integration + resume hardening + PUBLIC FLIP

**Oublex solo v1 is PUBLIC.** `games_catalog.requires_access=false` (site 200).

- **Rook integration.** Added `{ key:"oublex", label:"Oublex", emoji:"🗝️" }` to the
  Rook repo's `config.js` GAMES (auto-created #oublex channel + "Oublex player"
  role + 🗝️ picker reaction — both verified via the Discord API). Added Oublex
  UNIONs/CASE to `rook_leaderboards.sql`, `rook_weekly_points.sql` (solo),
  `sq_streak_allgames.sql`, and `oublex: "damage dealt"` to `leaderboard.js`
  METRIC. SQL applied to shared Supabase; verified all three functions return/
  count oublex. Rook commit `238da1e`.
  - **Deploy gotcha (→ Raeban c242):** the `rook` service user can't pull Forgejo
    (`/opt/rook` stuck at 33c83fe). Deployed by copying config.js + leaderboard.js
    to /opt/rook via `ssh raevm 'sudo -u rook tee ...'` then `systemctl restart rook`.

- **One-attempt hardening — resume (direction B, Rae's pick).** Mirrors Snibble's
  DB-backed daily state. New table **`oublex_daily_runs`** (migration
  `oublex_daily_runs.sql`, RLS own-rows) holds a full engine snapshot as jsonb.
  Reload / tab-close / device-switch now RESUMES the run instead of re-rolling
  the seed (the old replay hole). Snapshot written on first action, updated each
  move, deleted on game-over. Implementation: `rng.js` exposes mulberry32 state
  (getState/setState); `OublexRun.snapshot()/loadSnapshot()`; `SoloGamePage`
  loads the runs row → passes `initialSnapshot`/`onPersist` to `OublexGame`.
  Verified: snapshot/restore byte-identical (node determinism test), browser
  mid-run reload resumes, game-over writes result + clears the runs row,
  post-completion "delved" gate holds. Oublex commit `c79fffc`.
  - **Residual (→ c237):** delete-own RLS on `oublex_daily_runs` means a
    determined user could delete their row via the API to force a fresh seed.
    Honest/casual/cross-device closed; the API path is c237 (server write-guard +
    midnight auto-submit). Rae flagged + accepted this for launch.

- **Quill:** public launch announcement posted to #updates.

### 2026-07-02 (latest) — How-to-Play copy + picker rename

Wrote the real How-to-Play modal (`HowToPlayModal.jsx`) via Raven in Oublex's
dark-gross-but-clear voice (was placeholder "Instructions coming soon"). Covers
daily/one-attempt, the class picks + rules, spell-to-strike, runes, loot,
win/fall, and the leaderboard + clear-ranks. Includes a line that **damage
counts even on a death** (verified in code: the result row is written on any
game-over, and `oublex_solo_leaderboard` filters only by date, no win check).
Renamed the in-game picker heading **"Choose your delver" → "Choose your class"**
(Rae disliked "delver"). Verified both live in preview. Commit `9a5ef78`. Not
Quilled (help text). Voice/copy gotcha logged: show player-facing names/copy to
Rae before shipping — the clear-rank names went out unilaterally earlier and she
(fairly) flagged it.

### 2026-07-02 (later) — Overall difficulty retune + clear-rank

Rae: "a win every day isn't challenging enough." Sims confirmed it — at the old
curve even an *average* player (words ≤5) won 99% with 41 HP to spare. Built
`scripts/difficulty-sim.mjs` (runtime curve override, 3 player tiers: optimal /
average / casual). Key findings: hero HP and monster stats are the levers, but
they're hypersensitive and the skill gap is a cliff — the moment a skilled
player can lose, the pure-casual (≤3-letter) player hits 0%. So tune for the
AVERAGE player, not the floor.

**Decision (Rae): direction B — challenge = SCORE, not survival.** Keep survival
high so nobody's shut out, but shave the fat HP cushion + add a rank to chase.
Rae also asked to do it via MONSTERS, not hero HP (a shrinking HP bar is an
obvious nerf to players; a monster with a bit more HP is invisible).

Shipped (commit `048e97b`):
- **Curve retune** in `bestiary.js`: HP 12/18/24/30/40 → **13/20/26/33/44**,
  counter 4/6/8/10/12 → **5/7/9/11/13**. Sim: optimal ~99% win / average ~89%,
  HP cushion cut from ~54 to ~25. Hero HP stays 100 (untouched, deliberately).
- **Clear-rank** (`CLEAR_RANKS` + `clearRank()`/`nextRank()` in engine, shown on
  the win EndScreen): a win is graded by total damage (same axis as leaderboard)
  → Gravecrawler / Gutcutter (152) / Marrow-reaper (160) / Deathless (170).
  Thresholds from the winning-score distribution (wins span ~140–196). End
  screen shows rank + "N more damage to reach <next>" chase line. Names are
  Oublex dark-gross voice — easy to rename via Raven later.

Verified live: authed browser run (console auto-play through the dungeon) — win
screen showed "Rank: Marrow-reaper / 8 more damage to reach Deathless" at 162
dmg / 34 HP; loss screen shows no rank (correct). Also confirmed the `class`
column write end-to-end (a run stored `class='mage'`). Both sim harnesses
re-run clean.

**Quill is now ON for Oublex** (Rae, 2026-07-02): the game is close to finished
and playable, so player-facing changes now get a Discord `#updates` post to keep
testers informed. Posted the Ranger + difficulty + clear-rank changes at wrap-up.

### 2026-07-02 — Ranger balance retune + class analytics + sim harness

Dino reported the **Ranger** class made the daily too easy. Analyzed before
changing — live data was useless (only 5 rows / 2 players, and `class` was never
persisted). Built `scripts/balance-sim.mjs`, an **engine-truth** balance harness:
it plays each class across 80 seeds under an OPTIMAL solver and a CASUAL
(short-words-only, ≤3) solver, scoring candidate words through the engine's own
`evalSelection()` so it can't drift from shipped logic. Re-run it after any
class/curve change.

Finding: under optimal play all 4 classes are balanced (~100% win). The problem
was the casual player — old Ranger (double-shot on 2–3 letter words) won **100% /
54 HP left** while the field won ~0–24%. **Key lesson: multiplier size is a red
herring; word length is the lever.** Softening 2×→1.5× left casual win at 100%
(3-letter words are too abundant). Fix: Ranger double-shot now gated to
**2-letter words only** (`len === 2` in `oublexEngine.js` classDamage). Post-fix
sim: casual Ranger 41% / 14 HP — still the most accessible class but not a free
win; optimal unaffected. Blurb → "A 2-letter word strikes twice — if you know
the little ones."

Instrumentation: added nullable `class` column to `oublex_solo_results`
(migration `oublex_solo_results_add_class.sql`, applied to shared Supabase).
Client threads `run.heroClass` into the result upsert (`OublexGame.jsx` →
`SoloGamePage.jsx`). Deliberately kept OUT of the leaderboard RPCs — analytics
only, preserving the "class not shown on leaderboard" decision. Existing rows
stay NULL (not backfillable). Verified: build clean, new blurb renders live,
class write round-trips at the DB layer. NOT Quilled (still gated). Commit
`20c0234`.

### 2026-06-28 — Four classes (the v2 class build)

v1 shipped Bard-only; the other 3 classes were named but never designed and the
code had no class field/picker. Rae picked mechanics off an interactive spread
(`rae-side-quest/mockups/oublex-classes-mockup.html`). **Locked + built:**
- **Bard** (unchanged): adjacent doubled letter -> x1.5.
- **Mage** — long-word surge: 6-letter word x1.5, full 7-tile word x2 (else x1).
- **Ranger** — double shot: 2-3 letter word strikes twice (x2); 4+ single.
- **Cleric** — lifedrain: heal round(25% of damage dealt) per cast, no dmg mod.

Engine (`oublexEngine.js`): added `CLASSES` table (id/sigil/name/blurb/hpLabel),
a `'class'` opening phase + `heroClass` + `chooseClass(id)`, a `classDamage()`
modifier consumed by `evalSelection` (replaced the hard-coded Bard `doubled`
field with `mult`/`bonus`), Cleric heal in `cast()`, and a `classInfo` getter.
UI (`OublexGame.jsx`): new `ClassPicker` screen for phase `class`, dynamic HP
label from `classInfo.hpLabel` (was hard-coded "Bard"), damage meta now reads
`ev.mult`/`ev.bonus`. **Verified:** 9-assertion engine test (each mechanic
exact) + 30-seed x 4-class greedy sim through the real cast path = **all 4 win
30/30**, damage clustered 147-154 avg (Mage highest, Cleric survives most/deals
least — intended), so curve A holds, no retune. Clean `vite build`. Browser:
injected an admin session, drove picker -> Mage -> fight -> cast live, no console
errors. Lobby `SoloPlayCard` copy fixed this session (was "get out with as much
HP as you can", now "deal as much damage as you can before the dark takes you" to
match cumulative-damage scoring). Class is NOT persisted to the DB result row and
**Rae decided it does NOT need to be** (no class shown on the leaderboard), so no
`hero_class` column / RPC change.

### 2026-06-28 — Wildcard rework + scoring change

Rae flagged two things while testing: (1) the wildcard auto-resolved its letter
(brute-forced A–Z in `_validWord`) and the rack stayed stuck at 8 forever; (2)
the leaderboard ranked by HP remaining, which she didn't recall choosing and
which rewards survival over word skill. Fixed all three:

- **Wildcard letter picker** — `OublexGame.jsx` `WildPicker` (SQModal A–Z grid,
  Wordy-style); `engine.assignWild(id,letter)` stores the choice, `toggleTile`
  clears it on release. Wild still scores 0 (`tileValue`). Also fixed a latent
  two-blank-word-never-validates bug.
- **Rack returns to 7** — `refillSpent` filters out spent wild tiles instead of
  refilling them.
- **Score = cumulative damage** — `totalDamage` accrues in `cast`; `get score()`
  returns it. Leaderboard already rendered "pts" and sorts `score` desc
  server-side, so NO SQL change. Labels updated (end screen + already-delved).

Verified via a 14-assertion Node test of the pure engine (all pass) + clean
`vite build`. NOT exercised in a live authed browser (auth-gated). **Gotcha:**
existing `oublex_solo_results` rows hold old HP-based scores and will mix with
new damage scores on the leaderboard until cleared.

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

## 2026-07-02 — Removed "← you" leaderboard self-marker (Rae request)
Dropped the "← you" text label (Wordy: "(you)") from the leaderboard row in StatsPage. The `isYou`/`isMe` prop still drives the row highlight (bg-white/15 ring) — only the redundant text was removed. In-match "(you)" during live games left as-is (not a leaderboard). No Quill post (Rae's call, too small).

## 2026-07-02 — Server-side write guard + daily_runs re-roll close (c237)
Closed TWO cheats on the solo daily:
1. **Past-board padding** — `oublex_solo_results` was a direct client upsert (`play_date` from route param, RLS insert/update-own, no date check) → after midnight a still-open session could pad yesterday's board.
2. **Seed re-roll farm** (the c93/c243 residual) — `oublex_daily_runs` had delete-own, so a determined user could DELETE their in-progress snapshot via the API to force a fresh roll of the same seed and retry the daily.
- New `supabase/migrations/oublex_solo_results_write_guard.sql` (applied to prod via pooler): SECDEF `oublex_record_solo_result(p_play_date, p_score, p_class)` — stamps user_id, **STRICT today-only**, first-result-wins (on conflict do nothing), AND deletes the daily_runs snapshot itself. Doing cleanup in the RPC is what let me drop `oublex_daily_runs_delete_own` (closes the re-roll). Also dropped `oublex_solo_results` insert/update/**delete**-own (the admin reset button was already removed in c243, and delete-own would've let a user delete today's result to replay). `select_all` + daily_runs insert/select/update-own stay (resume still works, load path checks results-first so a post-finish snapshot is inert).
- `src/components/game/SoloGamePage.jsx`: `handleGameOver` now calls the RPC and no longer client-deletes the snapshot (server does it).
- Like Yahdle, strict-only means a run finished after its day ended isn't recorded (rare one-sitting dungeon). No client "day ended" note added inside OublexGame yet — minor UX nicety, flagged.
- Zero-downtime rollout: RPC applied first, client pushed (commit 3498eed), live bundle confirmed, then policies dropped. First Pages deploy failed transiently ("try again later") — re-ran. Guard SQL-verified (past→reject, today→allow). Authed play-path not clicked through (hub-login bounce) — Rae to confirm a full run once.
