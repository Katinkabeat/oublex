import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  SQBoardShell,
  SQLobbyHeader,
  SQBoardHeader,
} from '../../../../rae-side-quest/packages/sq-ui'
import AvatarMenu from '../lobby/AvatarMenu.jsx'
import HeaderRight from '../HeaderRight.jsx'
import OublexGame from './OublexGame.jsx'
import { supabase } from '../../lib/supabase.js'
import { atlanticYMD } from '../../lib/rng.js'

// Solo daily dungeon. gameId is the Atlantic YMD, so the seed (dungeon + tile
// bag) is identical for everyone that day. One attempt per day:
//   - A finished run's score is in oublex_solo_results → we show the result.
//   - An in-progress run's full snapshot is in oublex_daily_runs → we RESUME it
//     (reloading/leaving mid-run no longer re-rolls the same seed). The snapshot
//     is written on the first action and updated on every move; it's deleted when
//     the run ends. See oublex_daily_runs.sql. (Residual API-delete replay hole
//     is deferred to c237's server-side write-guard.)
export default function SoloGamePage({ session, profile, isAdmin }) {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const userId = session?.user?.id
  const [existing, setExisting] = useState(undefined) // undefined=loading | null=none | {score}
  const [resume, setResume] = useState(null) // in-progress run snapshot to restore, or null
  const [saveState, setSaveState] = useState('idle') // idle | saving | error | saved
  const lastResultRef = useRef(null) // {score, heroClass} of the finished run, for retry

  // True once this dungeon's Atlantic day has passed. A run finished after its
  // day rolled over can't be recorded — oublex_record_solo_result rejects any
  // non-today play_date (past days are immutable, per c237). Say so on the end
  // screen instead of retrying a write that can never succeed.
  const dayClosed = gameId !== atlanticYMD()

  useEffect(() => {
    if (!userId || !gameId) { setExisting(null); return }
    let active = true
    ;(async () => {
      // Finished run wins: if a result row exists, show it and don't resume.
      const { data: done } = await supabase
        .from('oublex_solo_results')
        .select('score')
        .eq('user_id', userId)
        .eq('play_date', gameId)
        .maybeSingle()
      if (!active) return
      if (done) { setExisting(done); return }
      // Otherwise look for an in-progress snapshot to resume.
      const { data: run } = await supabase
        .from('oublex_daily_runs')
        .select('run_state')
        .eq('user_id', userId)
        .eq('play_date', gameId)
        .maybeSingle()
      if (!active) return
      if (run?.run_state) setResume(run.run_state)
      setExisting(null)
    })()
    return () => { active = false }
  }, [userId, gameId])

  // Save the in-progress run snapshot after each move (upsert on the daily PK).
  function persistRun(snapshot) {
    if (!userId || !gameId) return
    supabase
      .from('oublex_daily_runs')
      .upsert(
        { user_id: userId, play_date: gameId, run_state: snapshot, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,play_date' },
      )
      .then(({ error }) => { if (error) console.error('[oublex] persist run failed', error) })
  }

  // Persist a finished run's result. Writes go through the SECURITY DEFINER
  // guard (oublex_record_solo_result): it stamps user_id from auth.uid(),
  // rejects any non-today play_date (past days immutable, c237), records
  // first-result-wins, AND deletes the in-progress snapshot server-side. The
  // snapshot cleanup lives in the RPC (not here) so delete-own can be dropped —
  // that's what closes the "delete my run to re-roll the same seed" farm.
  //
  // This MUST NOT be fire-and-forget: a swallowed failure silently drops the
  // score AND (because the snapshot is only deleted on success) leaves the run
  // resumable, trapping the player re-finishing the same dungeon. The common
  // failure is a stale/expired access token when a mobile tab was backgrounded
  // long enough for supabase-js's refresh timer to be throttled — so on failure
  // we refresh the session and retry before surfacing a visible error. Until a
  // write succeeds the snapshot stays put, so the run is never lost.
  async function recordResult(score, heroClass) {
    setSaveState('saving')
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.rpc('oublex_record_solo_result', {
        p_play_date: gameId, p_score: score, p_class: heroClass ?? null,
      })
      if (!error) { setSaveState('saved'); return }
      console.error(`[oublex] record result failed (attempt ${attempt + 1})`, error)
      // Renew a possibly-expired token, then back off briefly before retrying.
      await supabase.auth.refreshSession().catch(() => {})
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
    setSaveState('error')
  }

  function handleGameOver(score, heroClass) {
    if (!userId || !gameId) return
    if (dayClosed) return // the day rolled over; the end-screen note handles it, don't hit a guaranteed rejection
    lastResultRef.current = { score, heroClass }
    recordResult(score, heroClass)
  }

  function retrySave() {
    const r = lastResultRef.current
    if (r) recordResult(r.score, r.heroClass)
  }

  let body
  if (existing === undefined) {
    body = <div className="py-10 text-center opacity-70">Loading…</div>
  } else if (existing) {
    body = (
      <div className="card text-center max-w-xl mx-auto">
        <div className="font-display text-2xl text-wordy-700 mb-2">You've delved today.</div>
        <p>Total damage: <b>{existing.score}</b></p>
        <p className="text-xs opacity-70 mt-2">One run a day. The dungeon resets tomorrow.</p>
        <div className="flex gap-2 justify-center mt-4">
          <button className="btn-secondary" onClick={() => navigate('/')}>← Lobby</button>
          <button className="btn-primary" onClick={() => navigate('/stats')}>🏆 Leaderboard</button>
        </div>
      </div>
    )
  } else {
    body = (
      <OublexGame
        gameId={gameId}
        onGameOver={handleGameOver}
        initialSnapshot={resume}
        onPersist={persistRun}
        saveState={saveState}
        onRetrySave={retrySave}
        dayClosed={dayClosed}
      />
    )
  }

  return (
    <SQBoardShell
      width="narrow"
      header={
        <SQLobbyHeader
          title="Oublex"
          avatarSlot={<AvatarMenu profile={profile} />}
          rightSlot={<HeaderRight isAdmin={isAdmin} />}
        />
      }
      subHeader={
        <SQBoardHeader
          backLabel="← Lobby"
          onBackClick={() => navigate('/')}
          centerSlot={null}
          rightSlot={null}
        />
      }
    >
      <div className="py-6">{body}</div>
    </SQBoardShell>
  )
}
