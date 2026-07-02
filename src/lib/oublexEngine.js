// Oublex dungeon engine — pure game logic, no DOM.
// Ported from the approved mockup. Seeded per day so the dungeon + tile bag are
// identical for everyone on a given date; the dictionary is injected as a Set.

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

// Clear ranks — a *win* is graded by total damage dealt (the same axis as the
// leaderboard), so there's always a higher clear to chase instead of just
// "survived / didn't." Thresholds come from the winning-score distribution under
// the shipped curve (sim: wins span ~140–196, most land 150–165; skilled median
// ~159). Re-check with scripts/balance-sim.mjs if the curve changes. Ordered
// high→low; clearRank() returns the first tier the score reaches.
export const CLEAR_RANKS = [
  { min: 170, name: 'Deathless',     note: 'Nothing down here got a real bite in.' },
  { min: 160, name: 'Marrow-reaper', note: 'You left the rooms wet.' },
  { min: 152, name: 'Gutcutter',     note: 'Messy, but they went down.' },
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

// The 5-room dungeon is resolved per run from the tiered bestiary (see
// buildRooms): one monster per HP tier per day, one encounter + kill variant
// each, seeded so the dungeon is identical for everyone on a given date but
// rotates day to day. HP and counter-damage stay fixed per tier.

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

const V_POOL = "AAAAEEEEIIIOOUU".split('')
const C_POOL = "NNNRRRTTTLLLSSSDDGGBBCCMMPPFHVWYK".split('')
const isVowel = (l) => l === 'A' || l === 'E' || l === 'I' || l === 'O' || l === 'U'
const HERO_MAX = 100

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
    this.phase = 'class'          // class | intro | fight | victory | loot | win | dead
    this.heroClass = 'bard'       // overwritten by chooseClass before the run starts
    this.room = 0
    this.heroHP = HERO_MAX
    this.heroMax = HERO_MAX
    this.rooms = this.buildRooms() // 5 resolved rooms, seeded from the bestiary
    this.monsterHP = this.rooms[0].hp
    this.nextId = 0
    this.rack = this.freshRack()
    this.word = []                // array of tile ids
    this.log = ''
    this.lastRuneFlavor = ''
    this.totalDamage = 0          // leaderboard metric = cumulative damage dealt
  }

  // Resolve the 5 rooms for this run: one monster per HP tier, one encounter +
  // kill variant each. Uses its own seed stream so the tile bag is unaffected,
  // and is deterministic per gameId so the dungeon matches for everyone that day.
  buildRooms() {
    const r = rngFromSeed(`oublex:bestiary:${this.gameId}`)
    const pick = (arr) => arr[Math.floor(r() * arr.length)]
    return TIERS.map((tier) => {
      const m = pick(tier.monsters)
      return { name: m.name, hp: tier.hp, counter: tier.counter, enc: pick(m.enc), kill: pick(m.kill) }
    })
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

  enterDungeon() { this.phase = 'fight'; this.log = this.rooms[0].enc }

  cast() {
    const ev = this.evalSelection()
    if (!ev.valid || ev.len < 1) return
    this.monsterHP = Math.max(0, this.monsterHP - ev.dmg)
    this.totalDamage += ev.dmg     // cumulative word damage = the skill score
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
    const room = this.rooms[this.room]
    let msg
    if (ev.kind === 'rune') {
      this.lastRuneFlavor = RUNE_FLAVOR[this.runeIdx % RUNE_FLAVOR.length]
      this.runeIdx++
      msg = `${this.lastRuneFlavor} (${ev.dmg} dmg)${healMsg}`
    } else {
      msg = `You strike for ${ev.dmg}${ev.bonus ? ` (${ev.bonus})` : ''}.${healMsg}`
    }
    if (this.monsterHP <= 0) {
      this.phase = (this.room === this.rooms.length - 1) ? 'win' : 'victory'
      this.log = msg
    } else {
      this.heroHP = Math.max(0, this.heroHP - room.counter)
      this.log = `${msg} The ${room.name} hits back for ${room.counter}.`
      if (this.heroHP <= 0) this.phase = 'dead'
    }
  }

  pressOnward() { this.phase = 'loot' }

  takeLoot(kind) {
    if (kind === 'hp') this.heroHP = Math.min(this.heroMax, this.heroHP + 20)
    if (kind === 'wild') this.rack.push({ id: this.nextId++, letter: '?', isWild: true, assigned: null, spent: false })
    if (kind === 'redraw') this.rack = this.freshRack()
    this.room++
    this.monsterHP = this.rooms[this.room].hp
    this.word = []
    this.phase = 'fight'
    this.log = this.rooms[this.room].enc
  }

  // ---- resume (persist an in-progress run so a reload continues it) ----
  // A full snapshot of the mutable run state, including the RNG position and the
  // resolved rooms (stored, not rebuilt, so a mid-run curve/bestiary deploy can't
  // reshape a run already underway). JSON-safe → persisted to oublex_daily_runs.
  snapshot() {
    return {
      v: 1,
      gameId: this.gameId,
      phase: this.phase,
      heroClass: this.heroClass,
      room: this.room,
      heroHP: this.heroHP,
      heroMax: this.heroMax,
      rooms: this.rooms,
      monsterHP: this.monsterHP,
      nextId: this.nextId,
      rack: this.rack,
      word: this.word,
      log: this.log,
      lastRuneFlavor: this.lastRuneFlavor,
      totalDamage: this.totalDamage,
      runeIdx: this.runeIdx,
      rngState: this.rng.getState(),
    }
  }

  // Restore a run from a snapshot() payload (after the constructor's reset()).
  // Overwrites every mutable field and pins the RNG back to its saved position.
  loadSnapshot(s) {
    this.phase = s.phase
    this.heroClass = s.heroClass
    this.room = s.room
    this.heroHP = s.heroHP
    this.heroMax = s.heroMax
    this.rooms = s.rooms
    this.monsterHP = s.monsterHP
    this.nextId = s.nextId
    this.rack = s.rack
    this.word = s.word
    this.log = s.log
    this.lastRuneFlavor = s.lastRuneFlavor
    this.totalDamage = s.totalDamage
    this.runeIdx = s.runeIdx
    this.rng.setState(s.rngState)
    return this
  }

  // ---- derived ----
  get classInfo() { return CLASSES.find(c => c.id === this.heroClass) || CLASSES[0] }
  get isGameOver() { return this.phase === 'win' || this.phase === 'dead' }
  get score() { return this.totalDamage }       // leaderboard metric = cumulative damage
  get roomsCleared() { return this.phase === 'win' ? this.rooms.length : this.room }
}

function hasDoubledLetter(ls) {
  for (let i = 1; i < ls.length; i++) if (ls[i] === ls[i - 1]) return true
  return false
}
