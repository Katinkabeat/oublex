import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Top lobby card — entry point into a solo game. Default behavior is to
// generate a fresh game id and navigate to /game/:id; replace with whatever
// solo-launch flow the game needs (daily puzzle, free-play seed, etc.).
export default function SoloPlayCard({ session }) {
  const navigate = useNavigate()

  // Daily games: reflect whether today's solo is already finished so the lobby
  // offers a "view today's result" path instead of "play" (matches Rungles /
  // Yahdle / Snibble). Wire `playedToday` to a query of this game's daily-
  // results table for today's Atlantic YMD. Leave false for non-daily games.
  const [playedToday, setPlayedToday] = useState(false)

  // TODO (daily games only): set playedToday from the DB, e.g.
  // useEffect(() => {
  //   const userId = session?.user?.id
  //   if (!userId) return
  //   let active = true
  //   const today = atlanticYMD() // Atlantic YYYY-MM-DD
  //   supabase
  //     .from('<game>_solo_results')        // your daily-results table
  //     .select('play_date')
  //     .eq('user_id', userId)
  //     .eq('play_date', today)
  //     .maybeSingle()
  //     .then(({ data }) => { if (active) setPlayedToday(!!data) })
  //   return () => { active = false }
  // }, [session])

  // TODO replace with the real solo-game launcher (daily seed, new game id, etc.)
  function handlePlay() {
    const id = crypto.randomUUID()
    navigate(`/solo/${id}`)
  }

  return (
    <section className="card relative">
      <h2 className="font-display text-xl mb-1">🌸 Solo</h2>
      <p className="text-sm opacity-80 mb-3">
        {/* TODO write the solo pitch for Oublex */}
        Play on your own — no opponent needed.
      </p>
      <button type="button" className="btn-primary" onClick={handlePlay}>
        {playedToday ? '↗ View today\'s result' : '▶ Play Solo'}
      </button>
    </section>
  )
}
