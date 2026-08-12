// Oublex class-balance regression harness.
//
//   node scripts/balance-sim.mjs
//
// Drives the REAL engine (src/lib/oublexEngine.js) with a greedy best-damage
// solver across many daily seeds, under two player models:
//   - OPTIMAL: finds the best word in the rack each turn.
//   - CASUAL:  only reaches for short (<=3 letter) words — the low-effort path.
//
// Difficulty signal = win rate + HP remaining at win + turns to clear. Score
// (v2: damage that LANDS, overkill excluded) is reported too, for retuning
// CLEAR_RANKS in the engine.
//
// Because it evaluates candidate words through the engine's own evalSelection(),
// this stays truthful as the engine's class rules change — re-run it after any
// class/curve tweak to confirm no class trivializes the daily.
//
// History: the 2026-07-02 Ranger retune (double-shot 2-3 letter -> 2-letter only)
// was chosen off this harness. Before: casual Ranger won 100% / 54 HP left while
// the other three classes won ~15%. After: casual Ranger ~74% / ~20 HP, others
// unchanged. Optimal play is ~100% for every class either way.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { OublexRun, LETTER_VALUE } from '../src/lib/oublexEngine.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const dict = new Set(
  readFileSync(join(HERE, '..', 'public', 'words.txt'), 'utf8')
    .split(/\s+/).filter(Boolean).map(w => w.toUpperCase()),
)

// Anagram map: sorted-letter key -> valid words (len 2..7), for fast rack lookup.
const anagram = new Map()
for (const w of dict) {
  if (w.length < 2 || w.length > 7 || !/^[A-Z]+$/.test(w)) continue
  const key = w.split('').sort().join('')
  const arr = anagram.get(key)
  if (arr) arr.push(w); else anagram.set(key, [w])
}

// Best move for the current rack, evaluated through the ENGINE (no mirrored
// scoring). maxLen models player skill: 7 = optimal, 3 = casual short-word play.
function bestMove(run, maxLen) {
  const tiles = run.rack.filter(t => !t.spent && !t.isWild)
  const n = tiles.length
  let best = null // { ids, dmg }
  const save = run.word
  for (let mask = 1; mask < (1 << n); mask++) {
    const chosen = []
    for (let i = 0; i < n; i++) if (mask & (1 << i)) chosen.push(tiles[i])
    if (chosen.length > maxLen) continue
    let ids
    if (chosen.length === 1) {
      ids = [chosen[0].id]
    } else {
      const key = chosen.map(t => t.letter).sort().join('')
      const words = anagram.get(key)
      if (!words) continue
      // spell a concrete valid word by mapping its letters back onto tiles
      const pool = chosen.slice()
      ids = []
      for (const ch of words[0]) {
        const idx = pool.findIndex(t => t.letter === ch)
        ids.push(pool[idx].id); pool.splice(idx, 1)
      }
    }
    run.word = ids
    const ev = run.evalSelection() // engine-truth damage, incl. class modifier
    if (ev.valid && (!best || ev.dmg > best.dmg)) best = { ids, dmg: ev.dmg }
  }
  run.word = save
  return best
}

// Auto-use the satchel like a sensible player would: bloodmark/hexbind/poison
// are always worth burning (no downside), a scrap only if there's real HP to
// gain. Second wind is deliberately NOT auto-used — arming it early wastes it
// if the room ends safely, and this heuristic doesn't model "arm defensively
// at low HP," so it's left unused here (a slight conservative bias; real
// players can be smarter). Iterate high-to-low so splice() in popSatchel()
// doesn't shift not-yet-visited indices.
function maybeUseSatchel(run) {
  for (let i = run.satchel.length - 1; i >= 0; i--) {
    const kind = run.satchel[i].kind
    if (kind === 'bloodmark' || kind === 'hexbind' || kind === 'poison') { run.popSatchel(i); continue }
    if (kind === 'scrap' && run.heroHP <= run.heroMax - 28) run.popSatchel(i)
  }
}

// doorPolicy: 'safe' | 'risky' | 'alternate' — which door the sim takes at each
// of the two branch depths (1 and 3). Default 'safe' mirrors the old lootPolicy
// default (survival-leaning), matching this harness's original baseline.
function playRun(gameId, cls, maxLen, doorPolicy = 'safe') {
  const run = new OublexRun(gameId, dict)
  run.reset()
  run.chooseClass(cls)
  run.enterDungeon()
  let turns = 0
  while (!run.isGameOver && turns < 400) {
    if (run.phase === 'fight') {
      maybeUseSatchel(run)
      const mv = bestMove(run, maxLen)
      if (!mv) { run.phase = 'dead'; break }
      run.word = mv.ids
      run.cast()
      turns++
    } else if (run.phase === 'victory') {
      if (run.needsSatchelDecision) run.keepSatchel() // keep what you have rather than gamble on the swap
      run.pressOnward()
      if (run.phase === 'door') {
        const doorType = doorPolicy === 'alternate' ? (run.depth % 2 === 0 ? 'safe' : 'risky') : doorPolicy
        run.chooseDoor(doorType)
      }
    } else break
  }
  return { won: run.phase === 'win', hp: run.heroHP, score: run.score, turns, rooms: run.roomsCleared }
}

const SEEDS = Array.from({ length: 80 }, (_, i) => `sim-seed-${i}`)
const CLASSES = ['bard', 'mage', 'ranger', 'cleric']
const avg = a => a.reduce((s, x) => s + x, 0) / a.length
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

function profile(label, maxLen, doorPolicy = 'safe') {
  console.log(`\n=== ${label} (maxLen=${maxLen}, ${SEEDS.length} seeds, doors=${doorPolicy}) ===`)
  console.log('class   winRate   HPleft(avg/med)   score(avg/med)   turns(avg)   rooms(avg)   deaths')
  console.log('-----   -------   ---------------   --------------   ----------   ----------   ------')
  const out = {}
  for (const cls of CLASSES) {
    const runs = SEEDS.map(s => playRun(s, cls, maxLen, doorPolicy))
    const wins = runs.filter(r => r.won)
    const hp = wins.map(r => r.hp)
    const score = wins.map(r => r.score)
    out[cls] = { winRate: wins.length / runs.length, hpAvg: hp.length ? avg(hp) : 0, scores: score }
    console.log(
      `${cls.padEnd(7)} ${(out[cls].winRate * 100).toFixed(0).padStart(5)}%   ` +
      `${(hp.length ? avg(hp) : 0).toFixed(0).padStart(4)} / ${(hp.length ? med(hp) : 0).toString().padStart(3)}       ` +
      `${(score.length ? avg(score) : 0).toFixed(0).padStart(5)} / ${(score.length ? med(score) : 0).toString().padStart(4)}         ` +
      `${avg(runs.map(r => r.turns)).toFixed(1).padStart(6)}       ${avg(runs.map(r => r.rooms)).toFixed(2).padStart(5)}       ` +
      `${(runs.length - wins.length).toString().padStart(3)}`)
  }
  return out
}

const optimalSafe = profile('OPTIMAL player, safe doors — finds best word', 7, 'safe')
const optimalRisky = profile('OPTIMAL player, risky doors — finds best word', 7, 'risky')
const casual = profile('CASUAL player, safe doors — short words only (<=3)', 3, 'safe')

console.log('\n=== balance guardrail ===')
for (const [name, s] of [['optimal-safe', optimalSafe], ['optimal-risky', optimalRisky], ['casual', casual]]) {
  const spread = CLASSES.map(c => s[c].hpAvg)
  console.log(`${name}: HP-left spread ${Math.min(...spread).toFixed(0)}–${Math.max(...spread).toFixed(0)} ` +
    `across classes; win rates ${CLASSES.map(c => (s[c].winRate * 100).toFixed(0) + '%').join(' / ')}`)
}
console.log('\nWatch for: any class at ~100% casual win while others collapse = trivialized skill floor.')

console.log('\n=== score distribution (optimal, safe doors) — for CLEAR_RANKS thresholds in oublexEngine.js ===')
const allScores = CLASSES.flatMap(c => optimalSafe[c].scores).sort((a, b) => a - b)
if (allScores.length) {
  const pct = (p) => allScores[Math.min(allScores.length - 1, Math.floor(allScores.length * p))]
  console.log(`min ${allScores[0]} · p25 ${pct(0.25)} · median ${pct(0.5)} · p75 ${pct(0.75)} · p90 ${pct(0.9)} · max ${allScores[allScores.length - 1]}`)
}
