import { useEffect, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadDictionary } from '../../lib/dictionary.js'
import { OublexRun, INTRO, TRANSITION, LETTER_VALUE, CLASSES, clearRank, nextRank, ITEMS, DOOR_INFO } from '../../lib/oublexEngine.js'

// The Oublex solo dungeon. Mounts once per daily gameId, drives the OublexRun
// engine, and calls onGameOver(score, heroClass) once when the run ends (score =
// damage dealt (landed + half overkill) plus, on a win, the HP + efficiency
// bonuses — see the scoring docblock in oublexEngine.js; heroClass = chosen
// class, persisted for balance analytics).
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
    // Older snapshots (v1's linear rooms array, v2's single-slot satchel) are
    // structurally incompatible with the current engine — discard rather than
    // load a corrupt resume.
    if (initialSnapshot && initialSnapshot.v === 3) r.loadSnapshot(initialSnapshot)
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
      <RunBar depth={run.depth} phase={run.phase} map={run.map} />

      {run.phase === 'class' && <ClassPicker onPick={(id) => apply(() => run.chooseClass(id))} />}
      {run.phase === 'intro' && <Intro onEnter={() => apply(() => run.enterDungeon())} />}
      {run.phase === 'fight' && <Fight run={run} apply={apply} />}
      {run.phase === 'victory' && (
        <Victory
          run={run}
          onward={() => apply(() => run.pressOnward())}
          onSwap={(i) => apply(() => run.swapSatchel(i))}
          onKeep={() => apply(() => run.keepSatchel())}
        />
      )}
      {run.phase === 'door' && <DoorChoice run={run} onChoose={(d) => apply(() => run.chooseDoor(d))} />}
      {(run.phase === 'win' || run.phase === 'dead') && (
        <EndScreen run={run} saveState={saveState} onRetrySave={onRetrySave} dayClosed={dayClosed} />
      )}
    </div>
  )
}

// One pip per depth. Branch depths (a safe/risky choice happened there) get a
// small diamond marker so the bar reads as a map, not just a linear progress bar.
function RunBar({ depth, phase, map }) {
  return (
    <div className="flex gap-2 mb-4">
      {map.map((node, i) => {
        const done = i < depth || phase === 'win'
        const current = i === depth && phase !== 'win'
        const cls = done
          ? 'bg-green-600 border-green-600 text-white'
          : current
            ? 'border-wordy-500 text-wordy-600'
            : 'border-wordy-200 text-wordy-400'
        return (
          <div key={i} className={`flex-1 text-center py-1.5 rounded-md border text-xs font-extrabold ${cls}`}>
            {done ? '✓' : (node.branch ? '◆' : i + 1)}
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
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={onClick}
      className={`tile font-display ${size} ${selected ? 'opacity-40' : ''} ${readOnly ? 'tile-disabled' : ''}`}
    >
      <span className="leading-none">{tile.letter}</span>
      <span className="tile-value">{LETTER_VALUE[tile.letter]}</span>
    </button>
  )
}

// A row of tiles on ONE line (no wrap). w-11 like Yahdle. `small` = the
// word-staging tray.
function Rack({ tiles, word = [], onTile, readOnly, small }) {
  const size = small ? 'w-9 h-9 text-base' : 'w-11 h-11 text-xl'
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

// The held satchel items (0-2 slots) — shown mid-fight, each with a Use button
// that applies its effect immediately, and a discard so a slot can be freed up
// proactively rather than only when a new find forces a swap decision.
function Satchel({ items, onUse, onDiscard }) {
  if (!items.length) return null
  return (
    <div className="card mb-3 space-y-2">
      {items.map((item, i) => {
        const info = ITEMS[item.kind]
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-2xl">{info.icon}</span>
            <div className="flex-1">
              <div className="font-extrabold text-sm">{info.name}</div>
              <div className="text-[11px] opacity-70">{info.desc}</div>
            </div>
            <button type="button" className="btn-secondary" onClick={() => onUse(i)}>Use</button>
            <button type="button" className="btn-secondary" onClick={() => onDiscard(i)} aria-label={`Discard ${info.name}`}>✕</button>
          </div>
        )
      })}
    </div>
  )
}

function Fight({ run, apply }) {
  const room = run.currentRoom
  const ev = run.evalSelection()

  // The swing itself is unaffected by a burning bloodmark, and overkill (past
  // the monster's remaining HP) scores at half value — see cast() in the
  // engine. Preview the real hit plus a visible score callout whenever it
  // diverges from the raw damage shown.
  const landed = Math.min(ev.dmg, run.monsterHP)
  const overkill = ev.dmg - landed
  const scorePreview = (landed + Math.floor(overkill / 2)) * (run.runeActive ? 2 : 1)
  const scoreTag = scorePreview !== ev.dmg ? ` · ${run.runeActive ? '☡ ' : ''}scores ${scorePreview}` : ''
  let meta = null
  if (ev.kind === 'rune') meta = <span className="text-pink-500">rune · {ev.dmg} dmg{scoreTag}</span>
  else if (ev.kind === 'word' && ev.valid)
    meta = <span className="text-wordy-600">{ev.mult > 1 ? `${ev.base} ×${ev.mult} = ${ev.dmg} dmg` : `${ev.dmg} dmg`}{scoreTag}</span>
  else if (ev.kind === 'word' && !ev.valid) meta = <span className="text-rose-500">the spellbook has never heard of it</span>

  const canCast = ev.kind === 'rune' || (ev.kind === 'word' && ev.valid)
  const castLabel = ev.kind === 'rune' ? '⚡ hurl rune' : '⚔ cast word'

  return (
    <>
      <div className="card mb-3">
        <HPBar label={run.classInfo.hpLabel} value={run.heroHP} max={run.heroMax} tone="hero" />
      </div>

      <Satchel
        items={run.satchel}
        onUse={(i) => apply(() => run.popSatchel(i))}
        onDiscard={(i) => apply(() => run.discardSatchel(i))}
      />

      <div className="card mb-3">
        <p className="font-display text-2xl text-rose-500 mb-1">{room.name}</p>
        <p className="text-xs opacity-70 mb-2">
          counter: d{room.die}
          {room.die < room.dieOriginal ? ` (hexbound down from d${room.dieOriginal})` : ''}
        </p>
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
        <Rack tiles={run.rack} word={run.word} onTile={(id) => apply(() => run.toggleTile(id))} />
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

// Loot is no longer a separate room/screen — monsters drop it on the kill, and
// it's shown right here. An empty satchel gets it automatically; a full one
// forces a swap decision before you can move on (see needsSatchelDecision).
function Victory({ run, onward, onSwap, onKeep }) {
  const room = run.currentRoom
  const nextNode = run.map[run.depth + 1]
  const onwardLabel = nextNode?.branch ? 'Choose a door ▸' : 'Go Deeper ▸'
  const drop = run.pendingDrop
  return (
    <div className="card text-center">
      <div className="font-display text-2xl text-green-600 mb-2">{room.name} down.</div>
      <p className="leading-relaxed mb-1">{room.kill}</p>
      {drop && !drop.satchelFull && (
        <p className="text-sm font-bold text-wordy-600 mt-2">
          {ITEMS[drop.kind].icon} Found: {ITEMS[drop.kind].name}. Tucked into your satchel.
        </p>
      )}
      {run.needsSatchelDecision && (
        <div className="mt-3 p-3 rounded-xl border-2 border-wordy-200 bg-wordy-50">
          <p className="text-sm font-bold mb-2">
            {ITEMS[drop.kind].icon} Found: {ITEMS[drop.kind].name}. Both satchel slots are full.
          </p>
          <div className="flex flex-col gap-2 items-center">
            {run.satchel.map((held, i) => (
              <button key={i} className="btn-secondary" onClick={() => onSwap(i)}>
                Swap out {ITEMS[held.kind].name} for {ITEMS[drop.kind].name}
              </button>
            ))}
            <button className="btn-primary" onClick={onKeep}>Leave {ITEMS[drop.kind].name} behind</button>
          </div>
        </div>
      )}
      <p className="leading-relaxed opacity-60 mt-2 mb-1">{TRANSITION}</p>
      <button className="btn-primary mt-2" disabled={run.needsSatchelDecision} onClick={onward}>{onwardLabel}</button>
    </div>
  )
}

// A branch depth's two doors. Both are already resolved (see buildMap) so the
// monster, its die, and its HP are known up front — the drop stays a mystery.
function DoorChoice({ run, onChoose }) {
  const doors = run.pendingDoors
  return (
    <div className="card">
      <p className="font-display text-2xl text-center mb-1">The passage splits.</p>
      <p className="text-sm text-center opacity-70 mb-4">Pick a door.</p>
      <div className="grid gap-2.5">
        {['safe', 'risky'].map((k) => {
          const info = DOOR_INFO[k]
          const node = doors[k]
          return (
            <button key={k} type="button" onClick={() => onChoose(k)}
              className="text-left p-3 rounded-xl border-2 border-wordy-200 bg-wordy-50 hover:border-wordy-500 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{info.icon}</span>
                <span className="font-display text-lg">{info.label}</span>
                {k === 'risky' && <span className="text-[11px] font-bold text-amber-600 ml-auto">?? better</span>}
              </div>
              <div className="text-[13px] opacity-70 mt-0.5">{info.blurb}</div>
              <div className="text-[13px] font-bold mt-1.5">{node.name} · d{node.die} · {node.hp} HP</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EndScreen({ run, saveState, onRetrySave, dayClosed }) {
  const navigate = useNavigate()
  const won = run.phase === 'win'
  const rank = won ? clearRank(run.score) : null
  const next = won ? nextRank(run.score) : null
  return (
    <div className="card text-center">
      <div className="font-display text-2xl text-wordy-700 my-2">
        {won ? 'Dungeon cleared.' : `You fell in Room ${run.depth + 1}.`}
      </div>
      {won && (
        <div className="my-3">
          <div className="font-display text-xl text-wordy-800">Rank: {rank.name}</div>
          <div className="text-sm opacity-80">{rank.note}</div>
          <div className="text-xs opacity-70 mt-1">
            {next
              ? `${next.min - run.score} more to reach ${next.name}.`
              : 'Top rank. Nothing left to prove down here.'}
          </div>
        </div>
      )}
      <p className="leading-relaxed">
        Rooms cleared: <b>{run.roomsCleared}/5</b> · HP left: <b>{run.heroHP}</b>
      </p>
      <p className="leading-relaxed">
        Damage: <b>{run.totalDamage}</b>
        {won && <> · HP bonus: <b>+{run.hpBonus}</b> · Efficiency bonus: <b>+{run.efficiencyBonus}</b></>}
        {' '}· Score: <b>{run.score}</b>
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
          Your run is held safely and will resume if you leave. Nothing is lost until it saves.
        </p>
      </div>
    )
  }
  const msg = saveState === 'saved'
    ? 'Today\'s run is logged. One attempt per day. The leaderboard ranks by score.'
    : 'Saving your run…'
  return <p className="text-xs opacity-70 mt-2">{msg}</p>
}
