import { useEffect, useReducer, useRef, useState } from 'react'
import { loadDictionary } from '../../lib/dictionary.js'
import { OublexRun, ROOMS, INTRO, TRANSITION, LETTER_VALUE } from '../../lib/oublexEngine.js'

// The Oublex solo dungeon. Mounts once per daily gameId, drives the OublexRun
// engine, and calls onGameOver(score) once when the run ends (score = HP left).
export default function OublexGame({ gameId, onGameOver }) {
  const [dict, setDict] = useState(null)
  const runRef = useRef(null)
  const reportedRef = useRef(false)
  const [, force] = useReducer((x) => x + 1, 0)

  useEffect(() => {
    let active = true
    loadDictionary().then((set) => { if (active) setDict(set) })
    return () => { active = false }
  }, [])

  if (dict && !runRef.current) runRef.current = new OublexRun(gameId, dict)
  const run = runRef.current

  function apply(fn) {
    fn()
    if (run.isGameOver && !reportedRef.current) {
      reportedRef.current = true
      onGameOver?.(run.score)
    }
    force()
  }

  if (!run) {
    return <div className="py-10 text-center opacity-70">Loading the codex…</div>
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-3">
        <span className="inline-block px-3 py-1 rounded-full border border-wordy-400 text-wordy-700 text-xs font-extrabold tracking-wide uppercase">
          ♪ Bard — doubled-letter words +50% dmg
        </span>
      </div>

      <RunBar room={run.room} phase={run.phase} />

      {run.phase === 'intro' && <Intro onEnter={() => apply(() => run.enterDungeon())} />}
      {run.phase === 'fight' && <Fight run={run} apply={apply} />}
      {run.phase === 'victory' && <Victory run={run} onward={() => apply(() => run.pressOnward())} />}
      {run.phase === 'loot' && <Loot run={run} take={(k) => apply(() => run.takeLoot(k))} />}
      {(run.phase === 'win' || run.phase === 'dead') && <EndScreen run={run} />}
    </div>
  )
}

function RunBar({ room, phase }) {
  return (
    <div className="flex gap-2 mb-4">
      {ROOMS.map((r, i) => {
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
  const face = tile.letter === '?' ? '★' : tile.letter
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={onClick}
      className={`tile font-display ${size} ${selected ? 'opacity-40' : ''} ${readOnly ? 'tile-disabled' : ''}`}
    >
      <span className="leading-none">{face}</span>
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

function Intro({ onEnter }) {
  return (
    <div className="card text-center">
      {INTRO.map((line, i) => <p key={i} className="mb-2 leading-relaxed">{line}</p>)}
      <button className="btn-primary mt-3" onClick={onEnter}>Enter the dungeon ▸</button>
    </div>
  )
}

function Fight({ run, apply }) {
  const room = ROOMS[run.room]
  const ev = run.evalSelection()
  let meta = null
  if (ev.kind === 'rune') meta = <span className="text-pink-500">rune · {ev.dmg} dmg</span>
  else if (ev.kind === 'word' && ev.valid)
    meta = <span className="text-wordy-600">{ev.doubled ? `♪ ${ev.base} ×1.5 = ${ev.dmg} dmg` : `${ev.dmg} dmg`}</span>
  else if (ev.kind === 'word' && !ev.valid) meta = <span className="text-rose-500">not in the codex</span>

  const canCast = ev.kind === 'rune' || (ev.kind === 'word' && ev.valid)
  const castLabel = ev.kind === 'rune' ? '⚡ hurl rune' : '⚔ cast word'

  return (
    <>
      <div className="card mb-3">
        <p className="font-display text-2xl text-rose-500 mb-3">{room.name}</p>
        <HPBar label="Monster" value={run.monsterHP} max={room.hp} tone="monster" />
        <div className="mt-3 pt-3 border-t border-wordy-200 text-[15px] leading-relaxed min-h-[66px]">
          {run.log || room.enc}
        </div>
      </div>

      <div className="card mb-3">
        <div className="min-h-[52px] border-2 border-dashed border-wordy-200 rounded-lg flex items-center gap-1.5 flex-wrap p-2 bg-wordy-50 mb-1">
          {run.word.length
            ? <Rack tiles={run.wordTiles()} word={[]} small onTile={(id) => apply(() => run.toggleTile(id))} />
            : <span className="text-sm opacity-60 px-1">tap tiles to spell a word — or tap one to hurl it as a rune</span>}
        </div>
        <div className="flex justify-between text-sm font-bold opacity-70 mb-2 min-h-[18px]">
          <span>{ev.len ? (ev.kind === 'rune' ? '1 rune' : `${ev.len} letters`) : ''}</span>
          <span>{meta}</span>
        </div>
        <Rack tiles={run.rack} word={run.word} onTile={(id) => apply(() => run.toggleTile(id))} />
        <div className="flex gap-2 mt-3">
          <button className="btn-secondary flex-1" disabled={!run.word.length}
            onClick={() => apply(() => run.clearWord())}>clear</button>
          <button className="btn-primary flex-1" disabled={!canCast}
            onClick={() => apply(() => run.cast())}>{castLabel}</button>
        </div>
      </div>

      <div className="card">
        <HPBar label="You — Bard" value={run.heroHP} max={run.heroMax} tone="hero" />
      </div>
    </>
  )
}

function Victory({ run, onward }) {
  const room = ROOMS[run.room]
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
    { k: 'wild', icon: '◆', name: 'Wildcard tile', desc: 'a ★ that plays as any letter' },
    { k: 'hp', icon: '✚', name: '+20 HP', desc: 'patch your wounds' },
    { k: 'redraw', icon: '↻', name: 'Redraw rack', desc: 'swap all 7 for fresh tiles' },
  ]
  return (
    <div className="card">
      <p className="font-extrabold text-green-600 text-center mb-3">You search the room. Choose your spoils:</p>
      <HPBar label="You — Bard" value={run.heroHP} max={run.heroMax} tone="hero" />
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

function EndScreen({ run }) {
  const won = run.phase === 'win'
  return (
    <div className="card text-center">
      <div className="font-display text-2xl text-wordy-700 my-2">
        {won ? 'Dungeon cleared.' : `You fell in Room ${run.room + 1}.`}
      </div>
      <p className="leading-relaxed">
        Rooms cleared: <b>{run.roomsCleared}/5</b> · HP remaining: <b>{run.heroHP}</b>
      </p>
      <p className="text-xs opacity-70 mt-2">
        Today's run is logged. One attempt per day — the leaderboard ranks by HP remaining.
      </p>
    </div>
  )
}
