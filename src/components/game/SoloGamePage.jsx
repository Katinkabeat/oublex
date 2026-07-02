import { useEffect, useState } from 'react'
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

  function handleGameOver(score, heroClass) {
    if (!userId || !gameId) return
    supabase
      .from('oublex_solo_results')
      .upsert(
        { user_id: userId, play_date: gameId, score, class: heroClass ?? null },
        { onConflict: 'user_id,play_date', ignoreDuplicates: true },
      )
      .then(({ error }) => { if (error) console.error('[oublex] record result failed', error) })
    // The run is finished; drop the in-progress snapshot so it can't be resumed.
    supabase
      .from('oublex_daily_runs')
      .delete()
      .eq('user_id', userId)
      .eq('play_date', gameId)
      .then(({ error }) => { if (error) console.error('[oublex] clear run failed', error) })
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
          <button className="btn-primary" onClick={() => navigate('/stats')}>Leaderboard</button>
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
