// Oublex difficulty tuner.
//
//   node scripts/difficulty-sim.mjs
//
// Companion to balance-sim.mjs. Where that one checks the 4 classes are balanced
// against each other on the SHIPPED curve, this one explores how hard the daily
// is overall, and lets you try alternate curves WITHOUT editing the engine —
// it overrides monster HP, counter damage, hero HP, and loot healing at runtime.
//
// Reports win rate + HP-left at win under three player models:
//   OPTIMAL  (finds the best word)      — the ceiling.
//   AVERAGE  (words up to 5 letters)    — a normal player; the one to tune for.
//   CASUAL   (short words only, <=3)    — the floor; can't really be served by
//                                          any curve (the skill gap is a cliff).
//
// Design stance (Rae, 2026-07-02): challenge = SCORE, not survival. Keep survival
// high so nobody's shut out, but shave the HP cushion so wins feel earned and a
// clear-rank (see CLEAR_RANKS in the engine) gives skilled players a target.
//
// v2 branching/dice rework (2026-08-12): monster HP is still 13/20/26/33/44 per
// tier, but counter-attacks are now seeded per-room dice (d6/d8/d10/d10/d12/d20
// — locked by the design session, not a tuning lever here) instead of fixed
// 5/7/9/11/13. That swings harder than the old flat counters; HERO_MAX moved
// 100 -> 140 in response (this file's "SHIPPED" row is what found that number
// — see the "hero 140" row below).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { OublexRun } from '../src/lib/oublexEngine.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const dict = new Set(
  readFileSync(join(HERE, '..', 'public', 'words.txt'), 'utf8')
    .split(/\s+/).filter(Boolean).map(w => w.toUpperCase()),
)
const anagram = new Map()
for (const w of dict) {
  if (w.length < 2 || w.length > 7 || !/^[A-Z]+$/.test(w)) continue
  const key = w.split('').sort().join('')
  const arr = anagram.get(key); if (arr) arr.push(w); else anagram.set(key, [w])
}

function bestMove(run, maxLen) {
  const tiles = run.rack.filter(t => !t.spent)
  const n = tiles.length
  let best = null; const save = run.word
  for (let mask = 1; mask < (1 << n); mask++) {
    const chosen = []
    for (let i = 0; i < n; i++) if (mask & (1 << i)) chosen.push(tiles[i])
    if (chosen.length > maxLen) continue
    let ids
    if (chosen.length === 1) ids = [chosen[0].id]
    else {
      const key = chosen.map(t => t.letter).sort().join('')
      const words = anagram.get(key); if (!words) continue
      const pool = chosen.slice(); ids = []
      for (const ch of words[0]) { const i = pool.findIndex(t => t.letter === ch); ids.push(pool[i].id); pool.splice(i, 1) }
    }
    run.word = ids
    const ev = run.evalSelection()
    if (ev.valid && (!best || ev.dmg > best.dmg)) best = { ids, dmg: ev.dmg }
  }
  run.word = save
  return best
}

// Auto-use the satchel like a sensible player would (mirrors balance-sim.mjs;
// second wind excluded from auto-use, iterate high-to-low for splice safety).
function maybeUseSatchel(run) {
  for (let i = run.satchel.length - 1; i >= 0; i--) {
    const kind = run.satchel[i].kind
    if (kind === 'bloodmark' || kind === 'hexbind' || kind === 'poison') { run.popSatchel(i); continue }
    if (kind === 'scrap' && run.heroHP <= run.heroMax - 28) run.popSatchel(i)
  }
}

// Override every node's HP/die at a given depth (both doors, at a branch
// depth). Die sizes are LOCKED by the design session (d6/d8/d10/d10/d12/d20) —
// this tool is for exploring HP tuning, which the card leaves open; dieTiers
// exists for completeness but changing it means overriding the decided design.
// curve = { hpMul, dieMul, heroHP, healMul, hpTiers[], dieTiers[] }
function applyCurve(run, curve) {
  for (let depth = 0; depth < run.map.length; depth++) {
    const node = run.map[depth]
    const targets = node.branch ? [node.safe, node.risky] : [node.room]
    for (const r of targets) {
      r.hp = curve.hpTiers ? curve.hpTiers[depth] : Math.max(1, Math.round(r.hp * (curve.hpMul ?? 1)))
      const die = curve.dieTiers ? curve.dieTiers[depth] : Math.max(2, Math.round(r.die * (curve.dieMul ?? 1)))
      if (die !== r.die) {
        r.die = die
        r.dmgRolls = r.dmgRolls.map(() => Math.floor(Math.random() * die) + 1)
      }
    }
  }
}

// doorPolicy: which door the sim takes at each branch depth.
function playRun(gameId, cls, maxLen, curve, doorPolicy = 'safe') {
  const run = new OublexRun(gameId, dict)
  run.reset()
  run.chooseClass(cls)
  applyCurve(run, curve)
  run.heroMax = curve.heroHP ?? 140  // matches HERO_MAX in oublexEngine.js
  run.heroHP = run.heroMax
  run.monsterHP = run.currentRoom.hp
  const healMul = curve.healMul ?? 1
  run.enterDungeon()
  let turns = 0
  while (!run.isGameOver && turns < 400) {
    if (run.phase === 'fight') {
      maybeUseSatchel(run)
      const before = run.heroHP
      const mv = bestMove(run, maxLen); if (!mv) { run.phase = 'dead'; break }
      run.word = mv.ids; run.cast(); turns++
      // healMul only rescales the scrap heal actually applied above via popSatchel (+20 baked in)
      if (healMul !== 1 && run.heroHP > before) run.heroHP = Math.min(run.heroMax, before + Math.round((run.heroHP - before) * healMul))
    } else if (run.phase === 'victory') {
      if (run.needsSatchelDecision) run.keepSatchel()
      run.pressOnward()
      if (run.phase === 'door') {
        const doorType = doorPolicy === 'alternate' ? (run.depth % 2 === 0 ? 'safe' : 'risky') : doorPolicy
        run.chooseDoor(doorType)
      }
    } else break
  }
  return { won: run.phase === 'win', hp: run.heroHP, score: run.score }
}

const SEEDS = Array.from({ length: 120 }, (_, i) => `sim-seed-${i}`)
const CLASSES = ['bard', 'mage', 'ranger', 'cleric']
const avg = a => a.reduce((s, x) => s + x, 0) / a.length
function measure(maxLen, curve, doorPolicy = 'safe') {
  const runs = []
  for (const cls of CLASSES) for (const s of SEEDS) runs.push(playRun(s, cls, maxLen, curve, doorPolicy))
  const wins = runs.filter(r => r.won)
  return { winRate: wins.length / runs.length, hpAvg: wins.length ? avg(wins.map(r => r.hp)) : 0 }
}
function row(label, curve) {
  const p = m => `${(m.winRate*100).toFixed(0).padStart(4)}% ${m.hpAvg.toFixed(0).padStart(3)}`
  console.log(`${label.padEnd(30)} ${p(measure(7, curve))}    ${p(measure(5, curve))}    ${p(measure(3, curve))}`)
}

console.log(`${120*4} runs/cell, safe doors. loot auto-used (see maybeUseSatchel).\n`)
console.log('                               OPTIMAL     AVERAGE     CASUAL   (win% / HP-left)')
console.log('curve                          win  HP     win  HP     win  HP')
console.log('----------------------------   -------     -------     -------')
// SHIPPED curve reads straight from the engine (pass empty override):
row('SHIPPED (engine default)', {})
console.log('--- what-ifs (HP tuning only — dice sizes are locked, see docblock above) ---')
row('hero 120', { heroHP: 120 })
row('hero 140', { heroHP: 140 })
row('hero 140 + monster HP x0.85', { heroHP: 140, hpMul: 0.85 })
row('hero 160 + monster HP x0.85', { heroHP: 160, hpMul: 0.85 })
