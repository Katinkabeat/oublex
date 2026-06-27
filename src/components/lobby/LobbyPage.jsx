import { SQLobbyShell, SQLobbyHeader } from '../../../../rae-side-quest/packages/sq-ui'
import AvatarMenu from './AvatarMenu.jsx'
import HeaderRight from '../HeaderRight.jsx'
import SoloPlayCard from './SoloPlayCard.jsx'

// Oublex v1 is SOLO-ONLY (a daily dungeon). The scaffold's multiplayer layer
// (useMultiplayerLobby + MultiplayerCard + CompletedGamesSection) is deliberately
// NOT mounted here — the oublex_games/oublex_players tables aren't migrated, and a
// dormant MP hook would just spam "lobby failed" errors. Re-add them (and run the
// MP migrations) if/when an Oublex multiplayer mode is built. Tracked on c93.
export default function LobbyPage({ session, profile, isAdmin }) {
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
      <SoloPlayCard session={session} />
    </SQLobbyShell>
  )
}
