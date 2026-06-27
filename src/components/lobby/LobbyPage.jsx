import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { SQLobbyShell, SQLobbyHeader } from '../../../../rae-side-quest/packages/sq-ui'
import AvatarMenu from './AvatarMenu.jsx'
import HeaderRight from '../HeaderRight.jsx'
import SoloPlayCard from './SoloPlayCard.jsx'
import MultiplayerCard from './MultiplayerCard.jsx'
import CompletedGamesSection from './CompletedGamesSection.jsx'
import { useMultiplayerLobby } from '../../hooks/useMultiplayerLobby.js'

// Standard SQ lobby layout: solo card → multiplayer card → completed games.
// The multiplayer data layer (useMultiplayerLobby) is wired here and the
// buckets are passed down to MultiplayerCard + CompletedGamesSection, the
// same way Yahdle does it.
export default function LobbyPage({ session, profile, isAdmin }) {
  const navigate = useNavigate()
  const userId = session?.user?.id
  const {
    pendingInvites, sentInvites, activeGames, completed, openGames, opponents, loading,
  } = useMultiplayerLobby(userId)

  // Build the completed-games list with the canonical 4-branch headline so
  // admin-closed games + ties render correctly (never "highest score wins").
  const completedItems = useMemo(() => {
    const nameFor = (id) => (id === userId ? (profile?.username ?? 'You') : (opponents[id]?.username ?? 'Someone'))
    return (completed ?? []).map(g => {
      const players = (g['oublex_players'] ?? []).slice().sort((a, b) => a.player_index - b.player_index)
      const winners = players.filter(p => p.is_winner)
      const winnerNames = winners.map(p => nameFor(p.user_id)).join(' & ')
      // closed_reason set => the expire sweep closed a never-filled game
      // (never started, no scores). Render it instead of silently dropping.
      const headline = g.closed_reason === 'no_other_players'
        ? '🚫 Game closed'
        : g.closed_by_admin
          ? '🛑 Game closed by admin'
          : g.forfeit_user_id
            ? `🏳️ ${nameFor(g.forfeit_user_id)} forfeited — ${winnerNames || 'opponent'} wins!`
            : winners.length === 1
              ? `🏆 ${winnerNames} wins!`
              : winners.length > 1
                ? `🤝 Tie — ${winnerNames}`
                : "🤝 It's a tie!"
      const subtitle = g.closed_reason === 'no_other_players'
        ? 'Invite expired — this game closed because no other players joined.'
        : players
            .map(p => `${nameFor(p.user_id)} ${p.total_score ?? 0}`)
            .join('  ·  ')
      return { id: g.id, headline, subtitle }
    })
  }, [completed, opponents, userId, profile])

  return (
    <SQLobbyShell
      header={
        <SQLobbyHeader
          title="Oublex"
          avatarSlot={<AvatarMenu profile={profile} />}
          rightSlot={<HeaderRight isAdmin={isAdmin} />}
        />
      }
    >
      <SoloPlayCard />
      <MultiplayerCard
        user={session?.user}
        profile={profile}
        pendingInvites={pendingInvites}
        sentInvites={sentInvites}
        activeGames={activeGames}
        openGames={openGames}
        opponents={opponents}
        loading={loading}
      />
      <CompletedGamesSection
        games={completedItems}
        onView={(id) => navigate(`/multi/${id}`)}
      />
    </SQLobbyShell>
  )
}
