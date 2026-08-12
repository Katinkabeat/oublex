// Oublex dungeon engine — pure game logic, no DOM.
// v2: branching map. A daily run is 5 depths (entry -> branch -> mid -> branch
// -> boss). Depths 1 and 3 offer a safe/risky door choice; the rest are single
// forced rooms. Everything is seeded per day (map layout, monster dice, drops)
// so the dungeon is identical for everyone on a given date but feels alive —
// see buildMap() / resolveNode() below.

import { rngFromSeed } from './rng.js'
import { isValidWord as dictHas } from './dictionary.js'
import { TIERS } from './bestiary.js'

export const LETTER_VALUE = {
  A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,
  P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10,'?':0,
}

// The four classes. Each bends one rule of the fight; the chosen class is picked
// once at the start of a run and applies for the whole dungeon. Damage modifiers
// live in OublexRun.classDamage; the Cleric's heal lives in cast().
export const CLASSES = [
  { id:'bard',   sigil:'♪', name:'Bard',
    blurb:'A word with a doubled letter hits for 1.5x.',
    hpLabel:'♪ Bard · doubled letter 1.5x' },
  { id:'mage',   sigil:'✶', name:'Mage',
    blurb:'Go long. A 6-letter word hits 1.5x, a full 7-tile word 2x.',
    hpLabel:'✶ Mage · long-word surge' },
  { id:'ranger', sigil:'➹', name:'Ranger',
    blurb:'Go fast. A 2-letter word strikes twice, if you know the little ones.',
    hpLabel:'➹ Ranger · double shot' },
  { id:'cleric', sigil:'✚', name:'Cleric',
    blurb:'Drain life. Heal a quarter of the damage you deal.',
    hpLabel:'✚ Cleric · lifedrain' },
]
const CLASS_IDS = new Set(CLASSES.map(c => c.id))

// Clear ranks — a *win* is graded by score (damage that LANDS; overkill no
// longer counts, see cast()), so there's always a higher clear to chase instead
// of just "survived / didn't." Re-derived 2026-08-12 for the v2 branching/dice
// rework (HERO_MAX 140, safe-door optimal-play score distribution from
// scripts/balance-sim.mjs: min 136 · median 156 · p75 182 · p90 213 · max 259).
// Deathless sits near p90 (top ~10%, a real stretch); Marrow-reaper near p75;
// Gutcutter at the median, so a typical skilled clear lands there. Ordered
// high->low; clearRank() returns the first tier the score reaches.
export const CLEAR_RANKS = [
  { min: 210, name: 'Deathless',     note: 'Nothing down here got a real bite in.' },
  { min: 182, name: 'Marrow-reaper', note: 'You left the rooms wet.' },
  { min: 156, name: 'Gutcutter',     note: 'Messy, but they went down.' },
  { min: 0,   name: 'Gravecrawler',  note: 'You crawled back out. Barely.' },
]
export function clearRank(score) {
  return CLEAR_RANKS.find(r => score >= r.min) || CLEAR_RANKS[CLEAR_RANKS.length - 1]
}
// The next rank up and the score needed for it — powers the "chase" line on a
// win. Returns null once the top rank is reached.
export function nextRank(score) {
  const higher = CLEAR_RANKS.filter(r => r.min > score).sort((a, b) => a.min - b.min)
  return higher.length ? higher[0] : null
}

export const INTRO = [
  "The dark down here is older than the floor it sits on.",
  "You brought letters to a knife fight. Go.",
]
export const RUNE_FLAVOR = [
  "Out of words, you flick a single tile into the dark and hope.",
  "One loose letter, thrown like a stone. It'll have to do.",
  "No word left in you. You spend a lone rune and pray it lands.",
]
export const TRANSITION = "The floor slopes down. The dark gets friendlier with the dead."

// ---- doors ----
// Depths 1 and 3 (0-indexed) are branch points: a safe door (sturdier fight,
// mostly sustain drops) and a risky door (harder fight, better drops). Both
// doors show the monster, its die, and its HP before you pick — the drop stays
// a mystery until the kill (Rae's call: the unknown is the DnD excitement).
export const DOOR_INFO = {
  safe:  { icon: '🛡', label: 'Safe door',  blurb: 'Sturdier odds. Mostly keeps you standing.' },
  risky: { icon: '☠', label: 'Risky door', blurb: 'Rougher fight. Maybe a better find down that way.' },
}
const BRANCH_DEPTHS = new Set([1, 3])
const RISKY_STAT_BUMP = 1.15 // risky-door monster's HP scales up a bit over the tier baseline

// ---- dice ----
// "The dungeon rolls its dice once per day": every counter-attack draws from a
// pre-rolled, per-room seeded stream instead of Math.random, so two players who
// take the same number of hits in the same room take the exact same sequence of
// damage (refresh-scum guard; NO per-player RNG). Die size climbs with depth,
// and the risky door always rolls the bigger die of the pair.
const DICE_ROLLS_PER_ROOM = 40
function dieSize(depth, doorType) {
  if (depth === 0) return 6                       // entry
  if (depth === 1) return doorType === 'risky' ? 10 : 8   // first junction
  if (depth === 2) return 10                       // mid
  if (depth === 3) return doorType === 'risky' ? 12 : 10  // second junction
  return 20                                          // boss
}
const DIE_SHRINK = { 20: 12, 12: 10, 10: 8, 8: 6, 6: 6 }

// ---- satchel drops ----
// Two held-item slots (bumped from one, 2026-08-12 — see c329/c331), filled
// automatically on a kill. Both slots full when a drop lands triggers a swap
// decision (see needsSatchelDecision) — pick which slot to replace, or leave
// the new find behind. Named apart from the tile "rune" (the single-tile hurl
// below) so the two mechanics never read as the same thing in a log line.
export const SATCHEL_SLOTS = 2
export const ITEMS = {
  scrap:      { icon: '🧪', name: 'Potion',      desc: 'scavenged and unlabeled, drink it to heal 28 HP' },
  bloodmark:  { icon: '☡',  name: 'Bloodmark',   desc: 'burn it to double the damage that lands, for one room' },
  hexbind:    { icon: '⤓',  name: 'Hexbind',     desc: "chip a monster's die down a size, starting your next hit" },
  poison:     { icon: '☣',  name: 'Poison',      desc: 'coats your next cast, then ticks 3 more hits after, whatever you spell' },
  secondwind: { icon: '🌬', name: 'Second Wind', desc: 'arms a save, the next hit that would kill you leaves you at 1 HP instead' },
}
// Safe doors mostly drop sustain; risky doors mostly drop power. Non-branch
// rooms (entry / mid / boss) use a middling table. Tune freely — see
// scripts/balance-sim.mjs and scripts/difficulty-sim.mjs.
const DROP_TABLES = {
  safe:    [['scrap', 0.35], ['hexbind', 0.25], ['secondwind', 0.15], ['bloodmark', 0.15], ['poison', 0.10]],
  risky:   [['bloodmark', 0.25], ['poison', 0.30], ['secondwind', 0.15], ['hexbind', 0.20], ['scrap', 0.10]],
  neutral: [['scrap', 0.25], ['bloodmark', 0.20], ['hexbind', 0.20], ['poison', 0.20], ['secondwind', 0.15]],
}
function rollDrop(rng, doorType) {
  const table = DROP_TABLES[doorType || 'neutral']
  let roll = rng()
  for (const [kind, weight] of table) {
    if (roll < weight) return kind
    roll -= weight
  }
  return table[table.length - 1][0]
}

const V_POOL = "AAAAEEEEIIIOOUU".split('')
const C_POOL = "NNNRRRTTTLLLSSSDDGGBBCCMMPPFHVWYK".split('')
const isVowel = (l) => l === 'A' || l === 'E' || l === 'I' || l === 'O' || l === 'U'
// Bumped 100 -> 140 for the v2 dice rework (2026-08-12): seeded per-room dice
// (see dieSize()) swing harder than the old fixed counters did, and casual-play
// win rate collapsed to ~45% at HERO_MAX=100 in scripts/difficulty-sim.mjs.
// 140 restores it to ~87% (per-class 70-95%) while optimal stays ~100%, in
// line with the shipped design stance: challenge = score, not survival.
const HERO_MAX = 140

export class OublexRun {
  // gameId = Atlantic YMD (the daily seed); dict = Set of UPPERCASE valid words.
  constructor(gameId, dict) {
    this.gameId = gameId
    this.dict = dict
    this.rng = rngFromSeed(`oublex:daily:${gameId}`)
    this.runeIdx = 0
    this.reset()
  }

  reset() {
    this.rng = rngFromSeed(`oublex:daily:${this.gameId}`)
    this.phase = 'class'          // class | intro | fight | victory | door | win | dead
    this.heroClass = 'bard'       // overwritten by chooseClass before the run starts
    this.map = this.buildMap()    // 5 depths, seeded; see buildMap()
    this.depth = 0
    this.currentRoom = this.map[0].room  // depth 0 (entry) is always a single room
    this.roomTurn = 0              // counter-attacks taken in the current room (drives dmgRolls index)
    this.heroHP = HERO_MAX
    this.heroMax = HERO_MAX
    this.monsterHP = this.currentRoom.hp
    this.nextId = 0
    this.rack = this.freshRack()
    this.word = []                // array of tile ids
    this.log = ''
    this.lastRuneFlavor = ''
    this.totalDamage = 0          // leaderboard metric = damage that LANDS (see cast())
    this.satchel = []             // up to SATCHEL_SLOTS held { kind } items
    this.runeActive = false       // this room's bloodmark burn (x2 landed score)
    this.poisonTicks = 0          // remaining poison hits (one per cast), this room only
    this.poisonDmgPerTick = 0
    this.secondWindActive = false // this room's armed death-save
    this.pendingDrop = null       // { kind, satchelFull, resolved? } shown on the victory screen
  }

  // Resolve the day's 5-depth map. Depths 1 and 3 are branch points (both doors
  // resolved up front so the choice can show real stats); the rest are single
  // forced rooms. Each node gets its own monster, dice stream, and drop —
  // deterministic per gameId so the dungeon matches for everyone that day.
  buildMap() {
    const map = []
    for (let depth = 0; depth < 5; depth++) {
      const tier = TIERS[depth]
      if (BRANCH_DEPTHS.has(depth)) {
        map.push({
          branch: true,
          safe: this.resolveNode(depth, tier, 'safe'),
          risky: this.resolveNode(depth, tier, 'risky'),
        })
      } else {
        map.push({ branch: false, room: this.resolveNode(depth, tier, null) })
      }
    }
    return map
  }

  resolveNode(depth, tier, doorType) {
    const r = rngFromSeed(`oublex:bestiary:${this.gameId}:d${depth}:${doorType || 'x'}`)
    const pick = (arr) => arr[Math.floor(r() * arr.length)]
    const m = pick(tier.monsters)
    const enc = pick(m.enc)
    const kill = pick(m.kill)
    const hp = doorType === 'risky' ? Math.round(tier.hp * RISKY_STAT_BUMP) : tier.hp
    const die = dieSize(depth, doorType)
    const diceStream = rngFromSeed(`oublex:dice:${this.gameId}:d${depth}:${doorType || 'x'}`)
    const dmgRolls = Array.from({ length: DICE_ROLLS_PER_ROOM }, () => Math.floor(diceStream() * die) + 1)
    const dropStream = rngFromSeed(`oublex:drop:${this.gameId}:d${depth}:${doorType || 'x'}`)
    const drop = rollDrop(dropStream, doorType)
    // dieOriginal is fixed at resolve time so a hexbind's shrink (which mutates
    // `die`) stays visible to the UI as "shrunk from d{dieOriginal}".
    return { depth, doorType: doorType || null, name: m.name, hp, die, dieOriginal: die, dmgRolls, enc, kill, drop }
  }

  // ---- tiles / rack (seeded draws, >=2 vowels & >=2 consonants) ----
  pick(pool) { return pool[Math.floor(this.rng() * pool.length)] }

  freshRack() {
    const tiles = []; let v = 0, c = 0
    for (let i = 0; i < 7; i++) {
      let letter
      if (v < 2) { letter = this.pick(V_POOL); v++ }
      else if (c < 2) { letter = this.pick(C_POOL); c++ }
      else { letter = this.pick(this.rng() < 0.42 ? V_POOL : C_POOL); isVowel(letter) ? v++ : c++ }
      tiles.push({ id: this.nextId++, letter, spent: false })
    }
    return tiles
  }

  refillSpent() {
    // A spent wildcard is consumed, not replaced — the rack shrinks back to 7.
    this.rack = this.rack.filter(t => !(t.spent && t.isWild))
    const kept = this.rack.filter(t => !t.spent)
    let v = kept.filter(t => isVowel(t.letter)).length
    let c = kept.filter(t => !isVowel(t.letter) && t.letter !== '?').length
    this.rack = this.rack.map(t => {
      if (!t.spent) return t
      let letter
      if (v < 2) { letter = this.pick(V_POOL); v++ }
      else if (c < 2) { letter = this.pick(C_POOL); c++ }
      else { letter = this.pick(this.rng() < 0.42 ? V_POOL : C_POOL); isVowel(letter) ? v++ : c++ }
      return { id: this.nextId++, letter, spent: false }
    })
  }

  // ---- selection / damage ----
  wordTiles() { return this.word.map(id => this.rack.find(t => t.id === id)) }

  // The letter a tile contributes to a word: a wildcard plays as its
  // player-chosen letter; everything else is its own face.
  effLetter(t) { return t.isWild ? (t.assigned || '?') : t.letter }
  // Damage value of a tile — a wildcard is always worth 0.
  tileValue(t) { return t.isWild ? 0 : LETTER_VALUE[t.letter] }

  _validWord(letters) {
    const w = letters.join('')
    if (w.includes('?')) return false   // an unassigned wildcard can't form a word
    return dictHas(w, this.dict)
  }

  evalSelection() {
    const tiles = this.wordTiles()
    const letters = tiles.map(t => this.effLetter(t))
    const len = letters.length
    if (len === 0) return { len: 0, kind: 'none', valid: false, dmg: 0 }
    if (len === 1) return { len: 1, kind: 'rune', valid: true, dmg: this.tileValue(tiles[0]), letters }
    const base = tiles.reduce((s, t) => s + this.tileValue(t), 0)
    const valid = this._validWord(letters)
    const mod = this.classDamage(letters, len)   // the chosen class bends the damage
    const dmg = valid ? Math.round(base * mod.mult) : 0
    return { len, kind: 'word', valid, dmg, base, mult: mod.mult, bonus: mod.label, letters }
  }

  // The chosen class's damage modifier for a candidate word. Returns a multiplier
  // and a short label (shown when the multiplier beats 1x). The Cleric never
  // modifies damage here — its lifedrain heal is applied in cast().
  classDamage(letters, len) {
    switch (this.heroClass) {
      case 'mage':
        if (len >= 7) return { mult: 2, label: 'full-rack surge' }
        if (len >= 6) return { mult: 1.5, label: 'long-word surge' }
        return { mult: 1, label: '' }
      case 'ranger':
        // Double-shot is gated to 2-letter words only. Gating on length (not the
        // 2x size) is the real balance lever: 3-letter words are so abundant that
        // doubling them let a short-word-only player auto-win (sim: 100% win, 54
        // HP left). Restricting to 2-letter words rewards knowing the little
        // words (QI/ZA/XU…) and pulls casual Ranger back to ~74% win. See
        // scripts/balance-sim.mjs. (Ranger balance retune, c93, 2026-07-02.)
        if (len === 2) return { mult: 2, label: 'double shot' }
        return { mult: 1, label: '' }
      case 'cleric':
        return { mult: 1, label: '' }
      case 'bard':
      default:
        return hasDoubledLetter(letters) ? { mult: 1.5, label: 'doubled-letter bonus' } : { mult: 1, label: '' }
    }
  }

  // ---- actions ----
  toggleTile(id) {
    if (this.phase !== 'fight') return
    const t = this.rack.find(x => x.id === id)
    if (!t || t.spent) return
    const idx = this.word.indexOf(id)
    if (idx >= 0) {
      this.word.splice(idx, 1)
      if (t.isWild) t.assigned = null   // releasing a wildcard clears its chosen letter
    } else {
      this.word.push(id)
    }
  }

  // Assign the player-chosen letter to a wildcard tile before it joins a word.
  assignWild(id, letter) {
    const t = this.rack.find(x => x.id === id)
    if (t && t.isWild && !t.spent) t.assigned = letter
  }

  clearWord() {
    this.wordTiles().forEach(t => { if (t && t.isWild) t.assigned = null })
    this.word = []
  }

  // Lock in the class chosen on the opening screen, then show the intro.
  chooseClass(id) {
    if (CLASS_IDS.has(id)) this.heroClass = id
    this.phase = 'intro'
  }

  enterDungeon() { this.phase = 'fight'; this.log = this.currentRoom.enc }

  cast() {
    const ev = this.evalSelection()
    if (!ev.valid || ev.len < 1) return
    const before = this.monsterHP
    this.monsterHP = Math.max(0, this.monsterHP - ev.dmg)
    // Score = damage that LANDS (overkill past the monster's remaining HP is
    // excluded), doubled while a bloodmark burns. This doubling is deliberately
    // score-only, not a combat buff: a winning run's landed damage always sums
    // to exactly the HP of the monsters on its door path (every non-overkill
    // point on a kill sums to that monster's max HP, by definition) — so
    // bloodmark timing is the ONLY thing that can push a winning score past
    // that fixed floor. That's the real "chase a higher clear" lever.
    const landed = Math.min(ev.dmg, before)
    const scored = landed * (this.runeActive ? 2 : 1)
    this.totalDamage += scored
    // Cleric lifedrain: heal a quarter of the damage just dealt (applies before
    // the monster's counter, so a surviving turn nets heal minus counter).
    let healMsg = ''
    if (this.heroClass === 'cleric' && ev.dmg > 0) {
      const heal = Math.round(ev.dmg * 0.25)
      if (heal > 0) {
        this.heroHP = Math.min(this.heroMax, this.heroHP + heal)
        healMsg = ` You drain ${heal} HP.`
      }
    }
    this.wordTiles().forEach(t => { t.spent = true })
    this.refillSpent()
    this.word = []
    const room = this.currentRoom
    const tags = [ev.bonus, this.runeActive ? 'bloodmark x2' : ''].filter(Boolean).join(', ')
    // Show the swing plainly; only call out the score separately when a
    // bloodmark (or overkill trim) makes it diverge from the hit itself —
    // otherwise the extra clause is just noise.
    const scoreNote = scored !== ev.dmg ? ` Scores ${scored}.` : ''
    let msg
    if (ev.kind === 'rune') {
      this.lastRuneFlavor = RUNE_FLAVOR[this.runeIdx % RUNE_FLAVOR.length]
      this.runeIdx++
      msg = `${this.lastRuneFlavor} (${ev.dmg} dmg)${scoreNote}${healMsg}`
    } else {
      msg = `You strike for ${ev.dmg}${tags ? ` (${tags})` : ''}.${scoreNote}${healMsg}`
    }
    // Poison: a real (landed-only) extra hit on every cast while ticks remain,
    // independent of what you spell and NOT amplified by a burning bloodmark —
    // a separate damage lane on purpose, not a stacking multiplier (see popSatchel).
    let poisonMsg = ''
    if (this.poisonTicks > 0 && this.monsterHP > 0) {
      const beforePoison = this.monsterHP
      this.monsterHP = Math.max(0, this.monsterHP - this.poisonDmgPerTick)
      const poisonLanded = Math.min(this.poisonDmgPerTick, beforePoison)
      this.totalDamage += poisonLanded
      poisonMsg = ` Poison ticks for ${poisonLanded}.`
    }
    if (this.poisonTicks > 0) this.poisonTicks--
    if (this.monsterHP <= 0) {
      this.runeActive = false      // the bloodmark burn was scoped to this room; it ends on the kill
      this.poisonTicks = 0         // poison doesn't carry into the next room either
      this.secondWindActive = false // nor does an unused, still-armed second wind
      this.resolveDrop(room)
      this.phase = (this.depth === this.map.length - 1) ? 'win' : 'victory'
      this.log = `${msg}${poisonMsg}`
    } else {
      const dmg = room.dmgRolls[this.roomTurn % room.dmgRolls.length]
      this.roomTurn++
      let windMsg = ''
      if (this.heroHP - dmg <= 0 && this.secondWindActive) {
        this.heroHP = 1
        this.secondWindActive = false
        windMsg = ' Second Wind catches you at 1 HP.'
      } else {
        this.heroHP = Math.max(0, this.heroHP - dmg)
      }
      this.log = `${msg}${poisonMsg} The ${room.name} hits back for ${dmg}.${windMsg}`
      if (this.heroHP <= 0) this.phase = 'dead'
    }
  }

  // A kill's pre-rolled drop either slots into the satchel automatically (if
  // under SATCHEL_SLOTS), or (both slots full) surfaces a swap decision on the
  // victory screen — which slot to replace, or leave the find behind.
  resolveDrop(room) {
    if (!room.drop) { this.pendingDrop = null; return }
    if (this.satchel.length < SATCHEL_SLOTS) {
      this.satchel.push({ kind: room.drop })
      this.pendingDrop = { kind: room.drop, satchelFull: false }
    } else {
      this.pendingDrop = { kind: room.drop, satchelFull: true, resolved: false }
    }
  }

  get needsSatchelDecision() { return !!(this.pendingDrop?.satchelFull && !this.pendingDrop.resolved) }

  // slotIndex: which held item the new drop replaces.
  swapSatchel(slotIndex) {
    if (!this.needsSatchelDecision) return
    if (slotIndex < 0 || slotIndex >= this.satchel.length) return
    this.satchel[slotIndex] = { kind: this.pendingDrop.kind }
    this.pendingDrop.resolved = true
  }
  keepSatchel() {
    if (!this.needsSatchelDecision) return
    this.pendingDrop.resolved = true
  }

  // Drop a held item without using it — proactive slot management, usable any
  // time mid-fight (not just when a new find forces the issue).
  discardSatchel(slotIndex) {
    if (this.phase !== 'fight') return
    if (slotIndex < 0 || slotIndex >= this.satchel.length) return
    this.satchel.splice(slotIndex, 1)
  }

  // Use a held satchel item mid-fight. Potion heals now; a bloodmark burns for
  // the rest of the current room; a hexbind shrinks the room's die a size,
  // starting from your next hit (turns already resolved keep their rolls);
  // poison arms 3 ticks (one per subsequent cast, whatever you spell); second
  // wind arms a one-time death-save for the rest of the room.
  popSatchel(slotIndex) {
    if (this.phase !== 'fight') return
    const item = this.satchel[slotIndex]
    if (!item) return
    const kind = item.kind
    if (kind === 'scrap') {
      this.heroHP = Math.min(this.heroMax, this.heroHP + 28)  // scaled with HERO_MAX (100 -> 140)
    } else if (kind === 'bloodmark') {
      this.runeActive = true
    } else if (kind === 'hexbind') {
      const room = this.currentRoom
      room.die = DIE_SHRINK[room.die] ?? 6
      const reroll = rngFromSeed(`oublex:dice:${this.gameId}:shrink:d${room.depth}:${room.doorType || 'x'}:t${this.roomTurn}`)
      for (let i = this.roomTurn; i < room.dmgRolls.length; i++) {
        room.dmgRolls[i] = Math.floor(reroll() * room.die) + 1
      }
    } else if (kind === 'poison') {
      this.poisonTicks = 3
      this.poisonDmgPerTick = 4
    } else if (kind === 'secondwind') {
      this.secondWindActive = true
    }
    this.satchel.splice(slotIndex, 1)
  }

  // Advance past a cleared room: into the next single room, or into the door
  // choice if the next depth is a branch point. Blocked until a full-satchel
  // swap decision (if any) has been made.
  pressOnward() {
    if (this.needsSatchelDecision) return
    this.pendingDrop = null
    const nextDepth = this.depth + 1
    const nextNode = this.map[nextDepth]
    if (nextNode.branch) {
      this.phase = 'door'
    } else {
      this.enterRoom(nextDepth, nextNode.room)
    }
  }

  chooseDoor(doorType) {
    if (this.phase !== 'door') return
    const nextDepth = this.depth + 1
    const node = this.map[nextDepth][doorType]
    if (!node) return
    this.enterRoom(nextDepth, node)
  }

  enterRoom(depth, room) {
    this.depth = depth
    this.currentRoom = room
    this.roomTurn = 0
    this.monsterHP = room.hp
    this.word = []
    this.phase = 'fight'
    this.log = room.enc
  }

  // ---- resume (persist an in-progress run so a reload continues it) ----
  // v3: satchel became a 2-slot array (was a single {kind}|null) and gained
  // poison/second-wind state — a v2 snapshot's satchel shape doesn't match
  // (this.satchel.length would throw on the old object|null), so it must be
  // discarded like v1 before it, not loaded (the caller checks snapshot.v
  // before calling loadSnapshot; see OublexGame.jsx). The map (and every
  // node's dice/drop) is stored, not rebuilt, so a mid-run curve/bestiary/dice
  // deploy can't reshape a run already underway, and a hexbind's shrunk die
  // survives a reload. JSON-safe -> persisted to oublex_daily_runs.
  snapshot() {
    return {
      v: 3,
      gameId: this.gameId,
      phase: this.phase,
      heroClass: this.heroClass,
      map: this.map,
      depth: this.depth,
      currentRoom: this.currentRoom,
      roomTurn: this.roomTurn,
      heroHP: this.heroHP,
      heroMax: this.heroMax,
      monsterHP: this.monsterHP,
      nextId: this.nextId,
      rack: this.rack,
      word: this.word,
      log: this.log,
      lastRuneFlavor: this.lastRuneFlavor,
      totalDamage: this.totalDamage,
      runeIdx: this.runeIdx,
      satchel: this.satchel,
      runeActive: this.runeActive,
      poisonTicks: this.poisonTicks,
      poisonDmgPerTick: this.poisonDmgPerTick,
      secondWindActive: this.secondWindActive,
      pendingDrop: this.pendingDrop,
      rngState: this.rng.getState(),
    }
  }

  // Restore a v3 snapshot (after the constructor's reset()). Overwrites every
  // mutable field and pins the RNG back to its saved position.
  loadSnapshot(s) {
    this.phase = s.phase
    this.heroClass = s.heroClass
    this.map = s.map
    this.depth = s.depth
    this.currentRoom = s.currentRoom
    this.roomTurn = s.roomTurn
    this.heroHP = s.heroHP
    this.heroMax = s.heroMax
    this.monsterHP = s.monsterHP
    this.nextId = s.nextId
    this.rack = s.rack
    this.word = s.word
    this.log = s.log
    this.lastRuneFlavor = s.lastRuneFlavor
    this.totalDamage = s.totalDamage
    this.runeIdx = s.runeIdx
    this.satchel = s.satchel
    this.runeActive = s.runeActive
    this.poisonTicks = s.poisonTicks
    this.poisonDmgPerTick = s.poisonDmgPerTick
    this.secondWindActive = s.secondWindActive
    this.pendingDrop = s.pendingDrop
    this.rng.setState(s.rngState)
    return this
  }

  // ---- derived ----
  get classInfo() { return CLASSES.find(c => c.id === this.heroClass) || CLASSES[0] }
  get isGameOver() { return this.phase === 'win' || this.phase === 'dead' }
  get score() { return this.totalDamage }       // leaderboard metric = damage that lands
  get roomsCleared() { return this.phase === 'win' ? this.map.length : this.depth }
  // The next depth's door options, valid only while phase === 'door'.
  get pendingDoors() { return this.phase === 'door' ? this.map[this.depth + 1] : null }
}

function hasDoubledLetter(ls) {
  for (let i = 1; i < ls.length; i++) if (ls[i] === ls[i - 1]) return true
  return false
}
