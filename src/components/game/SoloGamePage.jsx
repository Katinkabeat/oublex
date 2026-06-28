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
// bag) is identical for everyone that day. One attempt per day: a finished run
// writes its score once (ignoreDuplicates), and if today's row already exists
// we show the result instead of a fresh playable run.
//
// Known v1 limitation: in-progress runs aren't persisted, so abandoning a run
// before it ends (closing the tab) lets you replay the same seed. Hardening
// (persist the run / write a row at start) is a follow-up, tracked on c93.
export default function SoloGamePage({ session, profile, isAdmin }) {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const userId = session?.user?.id
  const [existing, setExisting] = useState(undefined) // undefined=loading | null=none | {score}

  useEffect(() => {
    if (!userId || !gameId) { setExisting(null); return }
    let active = true
    supabase
      .from('oublex_solo_results')
      .select('score')
      .eq('user_id', userId)
      .eq('play_date', gameId)
      .maybeSingle()
      .then(({ data }) => { if (active) setExisting(data ?? null) })
    return () => { active = false }
  }, [userId, gameId])

  function handleGameOver(score) {
    if (!userId || !gameId) return
    supabase
      .from('oublex_solo_results')
      .upsert(
        { user_id: userId, play_date: gameId, score },
        { onConflict: 'user_id,play_date', ignoreDuplicates: true },
      )
      .then(({ error }) => { if (error) console.error('[oublex] record result failed', error) })
  }

  // Admin-only test tool: wipe today's row (DELETE-own RLS) so the daily can be
  // replayed. Gated to admins in the UI below; the policy only allows self-deletes.
  function handleReset() {
    if (!userId || !gameId) return
    supabase
      .from('oublex_solo_results')
      .delete()
      .eq('user_id', userId)
      .eq('play_date', gameId)
      .then(({ error }) => {
        if (error) { console.error('[oublex] reset failed', error); return }
        setExisting(null) // drop straight back into a fresh run of today's seed
      })
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
        {isAdmin && (
          <button
            type="button"
            onClick={handleReset}
            className="mt-3 text-xs font-bold px-3 py-1 rounded border border-amber-400 text-amber-600 hover:bg-amber-50"
            title="Admin only: delete today's result and replay the daily seed"
          >
            ↻ Reset today (admin)
          </button>
        )}
      </div>
    )
  } else {
    body = <OublexGame gameId={gameId} onGameOver={handleGameOver} />
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
