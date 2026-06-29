import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { atlanticYMD } from '../../lib/rng.js'

// Top lobby card — entry into today's daily dungeon. The gameId is the Atlantic
// YMD so everyone shares the same seed. Reflects whether today's run is done.
export default function SoloPlayCard({ session }) {
  const navigate = useNavigate()
  const [playedToday, setPlayedToday] = useState(false)

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return
    let active = true
    const today = atlanticYMD()
    supabase
      .from('oublex_solo_results')
      .select('play_date')
      .eq('user_id', userId)
      .eq('play_date', today)
      .maybeSingle()
      .then(({ data }) => { if (active) setPlayedToday(!!data) })
    return () => { active = false }
  }, [session])

  function handlePlay() {
    navigate(`/solo/${atlanticYMD()}`)
  }

  return (
    <section className="card relative">
      <h2 className="font-display text-xl mb-1">🗝️ Daily Dungeon</h2>
      <p className="text-sm opacity-80 mb-3">
        Spell your way down through five rooms. One run a day. Deal as much damage as you can before the dark takes you.
      </p>
      <button type="button" className="btn-primary" onClick={handlePlay}>
        {playedToday ? '↗ View today\'s result' : '▶ Play today\'s run'}
      </button>
    </section>
  )
}
