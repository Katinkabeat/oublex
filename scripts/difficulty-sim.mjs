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
// The shipped curve below (HP 13/20/26/33/44 · ctr 5/7/9/11/13) was picked here:
// optimal ~99% / average ~89% win, cushion cut from ~54 to ~25.
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
  const tiles = run.rack.filter(t => !t.spent && !t.isWild)
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

// curve = { hpMul, ctrMul, heroHP, healMul, hpTiers[], ctrTiers[] }
function playRun(gameId, cls, maxLen, curve) {
  const run = new OublexRun(gameId, dict)
  run.reset()
  run.chooseClass(cls)
  run.rooms.forEach((r, i) => {
    r.hp = curve.hpTiers ? curve.hpTiers[i] : Math.max(1, Math.round(r.hp * (curve.hpMul ?? 1)))
    r.counter = curve.ctrTiers ? curve.ctrTiers[i] : Math.max(0, Math.round(r.counter * (curve.ctrMul ?? 1)))
  })
  run.heroMax = curve.heroHP ?? 100
  run.heroHP = run.heroMax
  run.monsterHP = run.rooms[0].hp
  const healMul = curve.healMul ?? 1
  run.enterDungeon()
  let turns = 0
  while (!run.isGameOver && turns < 400) {
    if (run.phase === 'fight') {
      const mv = bestMove(run, maxLen); if (!mv) { run.phase = 'dead'; break }
      run.word = mv.ids; run.cast(); turns++
    } else if (run.phase === 'victory') {
      run.pressOnward()
      const before = run.heroHP
      run.takeLoot('hp')
      if (healMul !== 1) run.heroHP = Math.min(run.heroMax, before + Math.round(20 * healMul))
    } else break
  }
  return { won: run.phase === 'win', hp: run.heroHP }
}

const SEEDS = Array.from({ length: 120 }, (_, i) => `sim-seed-${i}`)
const CLASSES = ['bard', 'mage', 'ranger', 'cleric']
const avg = a => a.reduce((s, x) => s + x, 0) / a.length
function measure(maxLen, curve) {
  const runs = []
  for (const cls of CLASSES) for (const s of SEEDS) runs.push(playRun(s, cls, maxLen, curve))
  const wins = runs.filter(r => r.won)
  return { winRate: wins.length / runs.length, hpAvg: wins.length ? avg(wins.map(r => r.hp)) : 0 }
}
function row(label, curve) {
  const p = m => `${(m.winRate*100).toFixed(0).padStart(4)}% ${m.hpAvg.toFixed(0).padStart(3)}`
  console.log(`${label.padEnd(30)} ${p(measure(7, curve))}    ${p(measure(5, curve))}    ${p(measure(3, curve))}`)
}

console.log(`${120*4} runs/cell. loot=hp (survival-max; real play a touch harder).\n`)
console.log('                               OPTIMAL     AVERAGE     CASUAL   (win% / HP-left)')
console.log('curve                          win  HP     win  HP     win  HP')
console.log('----------------------------   -------     -------     -------')
// SHIPPED curve reads straight from the engine (pass empty override):
row('SHIPPED (engine default)', {})
console.log('--- what-ifs (edit freely to explore) ---')
row('old curve 12/18/24/30/40', { hpTiers: [12,18,24,30,40], ctrTiers: [4,6,8,10,12] })
row('harder: ctr 6/8/10/13/15', { ctrTiers: [6,8,10,13,15] })
row('easier: hero 110', { heroHP: 110 })
