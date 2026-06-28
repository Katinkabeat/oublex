// Oublex dungeon engine — pure game logic, no DOM.
// Ported from the approved mockup. Seeded per day so the dungeon + tile bag are
// identical for everyone on a given date; the dictionary is injected as a Set.

import { rngFromSeed } from './rng.js'
import { isValidWord as dictHas } from './dictionary.js'

export const LETTER_VALUE = {
  A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,
  P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10,'?':0,
}

// 5-room dungeon. HP curve + counter-damage are fixed (same for everyone);
// narrative is Raven's (still flagged for a voice rework before launch).
export const ROOMS = [
  { name:'Gnashling',   hp:12, counter:4,
    enc:"A Gnashling the size of a teapot screams at you and means it.",
    kill:"Your word swats it across the room. It is still yelling." },
  { name:'Mire Crawler', hp:18, counter:6,
    enc:"The Mire Crawler comes up through the standing water without a sound.",
    kill:"Your word opens it. It sinks back down the way it came." },
  { name:'Bone Choir',  hp:24, counter:8,
    enc:"Three skulls hold one note, and the note knows your name.",
    kill:"Your word breaks the chord. The silence afterward is worse." },
  { name:'Rust Ogre',   hp:30, counter:10,
    enc:"The Rust Ogre takes up the whole room and is in no hurry about it.",
    kill:"Your word goes through the armour. It takes the rest of the day to fall." },
  { name:'The Lexivore', hp:40, counter:12,
    enc:"The Lexivore opens every mouth at once and waits for you to feed it.",
    kill:"You spell the word it cannot eat. It starves in seconds. Run complete." },
]

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
    this.phase = 'intro'          // intro | fight | victory | loot | win | dead
    this.room = 0
    this.heroHP = HERO_MAX
    this.heroMax = HERO_MAX
    this.monsterHP = ROOMS[0].hp
    this.nextId = 0
    this.rack = this.freshRack()
    this.word = []                // array of tile ids
    this.log = ''
    this.lastRuneFlavor = ''
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

  _validWord(letters) {
    const w = letters.join('')
    if (!w.includes('?')) return dictHas(w, this.dict)
    const i = w.indexOf('?')
    for (let c = 65; c <= 90; c++) {
      const cand = w.slice(0, i) + String.fromCharCode(c) + w.slice(i + 1)
      if (!cand.includes('?') && dictHas(cand, this.dict)) return true
    }
    return false
  }

  evalSelection() {
    const tiles = this.wordTiles()
    const letters = tiles.map(t => t.letter)
    const len = letters.length
    if (len === 0) return { len: 0, kind: 'none', valid: false, dmg: 0 }
    if (len === 1) return { len: 1, kind: 'rune', valid: true, dmg: LETTER_VALUE[letters[0]], letters }
    const base = tiles.reduce((s, t) => s + LETTER_VALUE[t.letter], 0)
    const valid = this._validWord(letters)
    const doubled = hasDoubledLetter(letters)   // Bard: +50% on a doubled letter
    const dmg = valid ? Math.round(base * (doubled ? 1.5 : 1)) : 0
    return { len, kind: 'word', valid, dmg, base, doubled, letters }
  }

  // ---- actions ----
  toggleTile(id) {
    if (this.phase !== 'fight') return
    const t = this.rack.find(x => x.id === id)
    if (!t || t.spent) return
    const idx = this.word.indexOf(id)
    if (idx >= 0) this.word.splice(idx, 1); else this.word.push(id)
  }

  clearWord() { this.word = [] }

  enterDungeon() { this.phase = 'fight'; this.log = ROOMS[0].enc }

  cast() {
    const ev = this.evalSelection()
    if (!ev.valid || ev.len < 1) return
    this.monsterHP = Math.max(0, this.monsterHP - ev.dmg)
    this.wordTiles().forEach(t => { t.spent = true })
    this.refillSpent()
    this.word = []
    const room = ROOMS[this.room]
    let msg
    if (ev.kind === 'rune') {
      this.lastRuneFlavor = RUNE_FLAVOR[this.runeIdx % RUNE_FLAVOR.length]
      this.runeIdx++
      msg = `${this.lastRuneFlavor} (${ev.dmg} dmg)`
    } else {
      msg = `You strike for ${ev.dmg}${ev.doubled ? ' (doubled-letter bonus)' : ''}.`
    }
    if (this.monsterHP <= 0) {
      this.phase = (this.room === ROOMS.length - 1) ? 'win' : 'victory'
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
    if (kind === 'wild') this.rack.push({ id: this.nextId++, letter: '?', spent: false })
    if (kind === 'redraw') this.rack = this.freshRack()
    this.room++
    this.monsterHP = ROOMS[this.room].hp
    this.word = []
    this.phase = 'fight'
    this.log = ROOMS[this.room].enc
  }

  // ---- derived ----
  get isGameOver() { return this.phase === 'win' || this.phase === 'dead' }
  get score() { return this.heroHP }            // leaderboard metric = HP remaining
  get roomsCleared() { return this.phase === 'win' ? ROOMS.length : this.room }
}

function hasDoubledLetter(ls) {
  for (let i = 1; i < ls.length; i++) if (ls[i] === ls[i - 1]) return true
  return false
}
