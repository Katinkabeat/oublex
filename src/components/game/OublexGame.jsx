import { useEffect, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SQModal } from '../../../../rae-side-quest/packages/sq-ui'
import { loadDictionary } from '../../lib/dictionary.js'
import { OublexRun, INTRO, TRANSITION, LETTER_VALUE, CLASSES, clearRank, nextRank } from '../../lib/oublexEngine.js'

// The Oublex solo dungeon. Mounts once per daily gameId, drives the OublexRun
// engine, and calls onGameOver(score, heroClass) once when the run ends (score =
// total damage dealt; heroClass = chosen class, persisted for balance analytics).
//
// Resume: if initialSnapshot is passed (an in-progress run from oublex_daily_runs)
// the engine is restored to it instead of starting fresh. After every move that
// isn't the final one, onPersist(snapshot) saves the run so a reload continues it.
export default function OublexGame({ gameId, onGameOver, initialSnapshot, onPersist, saveState, onRetrySave, dayClosed }) {
  const [dict, setDict] = useState(null)
  const runRef = useRef(null)
  const reportedRef = useRef(false)
  const [, force] = useReducer((x) => x + 1, 0)

  useEffect(() => {
    let active = true
    loadDictionary().then((set) => { if (active) setDict(set) })
    return () => { active = false }
  }, [])

  if (dict && !runRef.current) {
    const r = new OublexRun(gameId, dict)
    if (initialSnapshot) r.loadSnapshot(initialSnapshot)
    runRef.current = r
  }
  const run = runRef.current

  function apply(fn) {
    fn()
    if (run.isGameOver && !reportedRef.current) {
      reportedRef.current = true
      onGameOver?.(run.score, run.heroClass)
    } else if (!run.isGameOver) {
      // Persist the in-progress run after each move (starts on the class pick,
      // the first action) so a reload resumes here instead of re-rolling the seed.
      onPersist?.(run.snapshot())
    }
    force()
  }

  if (!run) {
    return <div className="py-10 text-center opacity-70">Cracking open the spellbook…</div>
  }

  return (
    <div className="max-w-xl mx-auto">
      <RunBar room={run.room} phase={run.phase} count={run.rooms.length} />

      {run.phase === 'class' && <ClassPicker onPick={(id) => apply(() => run.chooseClass(id))} />}
      {run.phase === 'intro' && <Intro onEnter={() => apply(() => run.enterDungeon())} />}
      {run.phase === 'fight' && <Fight run={run} apply={apply} />}
      {run.phase === 'victory' && <Victory run={run} onward={() => apply(() => run.pressOnward())} />}
      {run.phase === 'loot' && <Loot run={run} take={(k) => apply(() => run.takeLoot(k))} />}
      {(run.phase === 'win' || run.phase === 'dead') && (
        <EndScreen run={run} saveState={saveState} onRetrySave={onRetrySave} dayClosed={dayClosed} />
      )}
    </div>
  )
}

function RunBar({ room, phase, count }) {
  return (
    <div className="flex gap-2 mb-4">
      {Array.from({ length: count }).map((_, i) => {
        const done = i < room || phase === 'win'
        const current = i === room && phase !== 'win'
        const cls = done
          ? 'bg-green-600 border-green-600 text-white'
          : current
            ? 'border-wordy-500 text-wordy-600'
            : 'border-wordy-200 text-wordy-400'
        return (
          <div key={i} className={`flex-1 text-center py-1.5 rounded-md border text-xs font-extrabold ${cls}`}>
            {done ? '✓' : i + 1}
          </div>
        )
      })}
    </div>
  )
}

function HPBar({ label, value, max, tone }) {
  const pct = Math.max(0, (value / max) * 100)
  const bar = tone === 'monster' ? 'bg-rose-500' : 'bg-green-500'
  return (
    <div>
      <div className="flex justify-between text-xs font-bold opacity-70 mb-1">
        <span>{label}</span><span>{value} / {max}</span>
      </div>
      <div className="h-4 rounded-full bg-wordy-100 border border-wordy-200 overflow-hidden">
        <div className={`h-full ${bar} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Single tile — uses the shared sq-ui `.tile` / `.tile-value` styling (same as
// Yahdle's dice). Selected (in-word) tiles just dim, no coloured highlight.
function Tile({ tile, size, selected, onClick, readOnly }) {
  // A wildcard shows ★ until the player assigns it a letter, then shows that
  // letter in amber so it reads as "this is your wild playing as X" (value 0).
  const face = tile.isWild ? (tile.assigned || '★') : tile.letter
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={onClick}
      className={`tile font-display ${size} ${selected ? 'opacity-40' : ''} ${readOnly ? 'tile-disabled' : ''}`}
    >
      <span className={`leading-none${tile.isWild ? ' text-amber-500' : ''}`}>{face}</span>
      <span className="tile-value">{LETTER_VALUE[tile.letter]}</span>
    </button>
  )
}

// A row of tiles on ONE line (no wrap). w-11 like Yahdle; shrinks to w-10 if a
// wildcard pushes the rack to 8 so it still fits a narrow phone. `small` = the
// word-staging tray.
function Rack({ tiles, word = [], onTile, readOnly, small }) {
  const size = small
    ? 'w-9 h-9 text-base'
    : (tiles.length > 7 ? 'w-10 h-10 text-lg' : 'w-11 h-11 text-xl')
  return (
    <div className="flex justify-center gap-1.5">
      {tiles.map((t) => (
        <Tile key={t.id} tile={t} size={size} selected={word.includes(t.id)} readOnly={readOnly}
          onClick={() => onTile?.(t.id)} />
      ))}
    </div>
  )
}

// The opening screen: choose one of the four classes for this run. Each bends a
// single rule of the fight, so the pick is a real strategy choice for the day.
function ClassPicker({ onPick }) {
  return (
    <div className="card">
      <p className="font-display text-2xl text-center mb-1">Choose your class</p>
      <p className="text-sm text-center opacity-70 mb-4">One class for the whole run. Each bends a rule of the fight.</p>
      <div className="grid gap-2.5">
        {CLASSES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
            className="flex items-center gap-3 text-left p-3 rounded-xl border-2 border-wordy-200 bg-wordy-50 hover:border-wordy-500 transition-colors"
          >
            <span className="text-2xl w-7 text-center shrink-0">{c.sigil}</span>
            <span>
              <span className="block font-display text-lg leading-tight">{c.name}</span>
              <span className="block text-[13px] opacity-70 leading-snug">{c.blurb}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Intro({ onEnter }) {
  return (
    <div className="card text-center">
      {INTRO.map((line, i) => <p key={i} className="mb-2 leading-relaxed">{line}</p>)}
      <button className="btn-primary mt-3" onClick={onEnter}>Enter the dungeon ▸</button>
    </div>
  )
}

// A–Z picker for assigning a wildcard the letter the player intends to use.
// Mirrors Wordy's blank-tile modal; the wildcard still scores 0 damage.
function WildPicker({ onPick, onCancel }) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  return (
    <SQModal open onClose={onCancel} title="★ Choose a letter for your wildcard">
      <div className="grid grid-cols-7 gap-1.5">
        {letters.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onPick(l)}
            className="h-9 rounded-lg bg-wordy-100 hover:bg-wordy-300 text-wordy-800 font-display text-base transition-colors"
          >
            {l}
          </button>
        ))}
      </div>
      <p className="text-[11px] opacity-60 mt-3">The wildcard plays as this letter but scores 0 damage. It's used up once you cast.</p>
    </SQModal>
  )
}

function Fight({ run, apply }) {
  const room = run.rooms[run.room]
  const ev = run.evalSelection()
  const [wildId, setWildId] = useState(null)

  // Tapping a not-yet-played wildcard opens the picker; everything else toggles.
  function onRackTile(id) {
    const t = run.rack.find((x) => x.id === id)
    if (t?.isWild && !run.word.includes(id)) { setWildId(id); return }
    apply(() => run.toggleTile(id))
  }
  function pickWild(letter) {
    const id = wildId
    setWildId(null)
    apply(() => { run.assignWild(id, letter); run.toggleTile(id) })
  }
  let meta = null
  if (ev.kind === 'rune') meta = <span className="text-pink-500">rune · {ev.dmg} dmg</span>
  else if (ev.kind === 'word' && ev.valid)
    meta = <span className="text-wordy-600">{ev.mult > 1 ? `${ev.base} ×${ev.mult} = ${ev.dmg} dmg` : `${ev.dmg} dmg`}</span>
  else if (ev.kind === 'word' && !ev.valid) meta = <span className="text-rose-500">the spellbook has never heard of it</span>

  const canCast = ev.kind === 'rune' || (ev.kind === 'word' && ev.valid)
  const castLabel = ev.kind === 'rune' ? '⚡ hurl rune' : '⚔ cast word'

  return (
    <>
      {wildId != null && <WildPicker onPick={pickWild} onCancel={() => setWildId(null)} />}
      <div className="card mb-3">
        <HPBar label={run.classInfo.hpLabel} value={run.heroHP} max={run.heroMax} tone="hero" />
      </div>

      <div className="card mb-3">
        <p className="font-display text-2xl text-rose-500 mb-3">{room.name}</p>
        <HPBar label="Monster" value={run.monsterHP} max={room.hp} tone="monster" />
        <div className="mt-3 pt-3 border-t border-wordy-200 text-[15px] leading-relaxed min-h-[66px]">
          {run.log || room.enc}
        </div>
      </div>

      <div className="card">
        <div className="min-h-[52px] border-2 border-dashed border-wordy-200 rounded-lg flex items-center gap-1.5 flex-wrap p-2 bg-wordy-50 mb-1">
          {run.word.length
            ? <Rack tiles={run.wordTiles()} word={[]} small onTile={(id) => apply(() => run.toggleTile(id))} />
            : <span className="text-sm opacity-60 px-1">tap tiles to spell a word, or tap one to hurl it as a rune</span>}
        </div>
        <div className="flex justify-between text-sm font-bold opacity-70 mb-2 min-h-[18px]">
          <span>{ev.len ? (ev.kind === 'rune' ? '1 rune' : `${ev.len} letters`) : ''}</span>
          <span>{meta}</span>
        </div>
        <Rack tiles={run.rack} word={run.word} onTile={onRackTile} />
        <div className="flex gap-2 mt-3">
          <button className="btn-secondary flex-1" disabled={!run.word.length}
            onClick={() => apply(() => run.clearWord())}>clear</button>
          <button className="btn-primary flex-1" disabled={!canCast}
            onClick={() => apply(() => run.cast())}>{castLabel}</button>
        </div>
      </div>
    </>
  )
}

function Victory({ run, onward }) {
  const room = run.rooms[run.room]
  return (
    <div className="card text-center">
      <div className="font-display text-2xl text-green-600 mb-2">{room.name} down.</div>
      <p className="leading-relaxed mb-1">{room.kill}</p>
      <p className="leading-relaxed opacity-60 mb-1">{TRANSITION}</p>
      <button className="btn-primary mt-2" onClick={onward}>Go Deeper ▸</button>
    </div>
  )
}

function Loot({ run, take }) {
  const options = [
    { k: 'wild', icon: '◆', name: 'Wildcard tile', desc: 'a ★ you play as any letter, once' },
    { k: 'hp', icon: '✚', name: '+20 HP', desc: 'patch your wounds' },
    { k: 'redraw', icon: '↻', name: 'Redraw rack', desc: 'swap all 7 for fresh tiles' },
  ]
  return (
    <div className="card">
      <p className="font-extrabold text-green-600 text-center mb-3">You search the room. Choose your spoils:</p>
      <HPBar label={run.classInfo.hpLabel} value={run.heroHP} max={run.heroMax} tone="hero" />
      <p className="text-xs font-bold opacity-70 mt-3 mb-1">Your current rack</p>
      <Rack tiles={run.rack} readOnly />
      <div className="flex gap-2.5 mt-4">
        {options.map((o) => (
          <button key={o.k} onClick={() => take(o.k)}
            className="flex-1 text-center p-3 rounded-xl border-2 border-wordy-200 bg-wordy-50 hover:border-wordy-500 transition-colors">
            <div className="text-2xl">{o.icon}</div>
            <div className="text-sm font-extrabold mt-1">{o.name}</div>
            <div className="text-[11px] opacity-70 mt-0.5">{o.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function EndScreen({ run, saveState, onRetrySave, dayClosed }) {
  const navigate = useNavigate()
  const won = run.phase === 'win'
  const rank = won ? clearRank(run.totalDamage) : null
  const next = won ? nextRank(run.totalDamage) : null
  return (
    <div className="card text-center">
      <div className="font-display text-2xl text-wordy-700 my-2">
        {won ? 'Dungeon cleared.' : `You fell in Room ${run.room + 1}.`}
      </div>
      {won && (
        <div className="my-3">
          <div className="font-display text-xl text-wordy-800">Rank: {rank.name}</div>
          <div className="text-sm opacity-80">{rank.note}</div>
          <div className="text-xs opacity-70 mt-1">
            {next
              ? `${next.min - run.totalDamage} more damage to reach ${next.name}.`
              : 'Top rank. Nothing left to prove down here.'}
          </div>
        </div>
      )}
      <p className="leading-relaxed">
        Rooms cleared: <b>{run.roomsCleared}/5</b> · Total damage: <b>{run.totalDamage}</b> · HP left: <b>{run.heroHP}</b>
      </p>
      {dayClosed
        ? <DayEnded />
        : <SaveStatus saveState={saveState} onRetrySave={onRetrySave} />}
      {/* Canonical SQ daily exit row (Yahdle/Rungles/Snibble): never gated by
          outcome or save state — cleared, fell, or day-closed all get the same
          two doors out. */}
      <div className="flex gap-2 justify-center mt-4">
        <button className="btn-secondary" onClick={() => navigate('/')}>← Lobby</button>
        <button className="btn-primary" onClick={() => navigate('/stats')}>🏆 Leaderboard</button>
      </div>
    </div>
  )
}

// The run crossed midnight, so its day is over and the server won't record it.
// Shown in place of SaveStatus, whose "Couldn't save · Retry" state would offer
// a write that the play_date guard rejects every time.
function DayEnded() {
  return (
    <div className="mt-3">
      <p className="font-display text-lg text-wordy-700">Day ended 🌙</p>
      <p className="text-sm opacity-70 mt-1">
        This dungeon's day ended at midnight, so this run won't be recorded. Come back for today's dungeon.
      </p>
    </div>
  )
}

// The result write can fail (usually a stale token from a backgrounded tab).
// Reflect the true save state instead of claiming the run is logged when it
// isn't — a silent failure both loses the score and traps the player replaying.
function SaveStatus({ saveState, onRetrySave }) {
  if (saveState === 'error') {
    return (
      <div className="mt-3">
        <p className="text-sm text-rose-500 font-bold">Couldn't save your run.</p>
        <button className="btn-primary mt-2" onClick={onRetrySave}>Retry saving</button>
        <p className="text-[11px] opacity-60 mt-2">
          Your run is held safely and will resume if you leave — nothing is lost until it saves.
        </p>
      </div>
    )
  }
  const msg = saveState === 'saved'
    ? 'Today\'s run is logged. One attempt per day. The leaderboard ranks by total damage dealt.'
    : 'Saving your run…'
  return <p className="text-xs opacity-70 mt-2">{msg}</p>
}
