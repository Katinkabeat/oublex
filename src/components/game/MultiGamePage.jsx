import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  SQBoardShell,
  SQLobbyHeader,
  SQBoardHeader,
  SQSettingsRow,
} from '../../../../rae-side-quest/packages/sq-ui'
import AvatarMenu from '../lobby/AvatarMenu.jsx'
import HeaderRight from '../HeaderRight.jsx'
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel.js'
import { supabase } from '../../lib/supabase.js'
import {
  loadGame,
  loadPlayers,
  submitTurn,
  forfeitGame,
  claimInactiveWin,
  rematch,
  acceptInvite,
  cancelInvite,
  joinOpenGame,
} from '../../lib/multiplayerActions.js'

// Oublex multiplayer game page — GENERIC N-player (2–4) shell ported
// from Yahdle. It handles ALL the multiplayer plumbing so you only have
// to drop in real gameplay:
//   • realtime + polling refresh of game/players
//   • waiting room ("X/N seats", auto-start when full)
//   • auto-accept an invited friend who deep-links in via push
//   • per-player score pills (current-turn lit, tap an opponent)
//   • forfeit / claim-inactive-win
//   • N-column game-over comparison + rematch
//
// The ONE thing it stubs is the actual play surface — see the
// "GAME-SPECIFIC PLAY AREA" block below. It ships a demo control (a
// number input + "Submit turn" button) wired to the stub
// oublex_submit_turn RPC so the whole turn engine is exercisable
// end-to-end (turns rotate, the game finishes) before you build the
// real board. Replace it with your game.
export default function MultiGamePage({ session, profile, isAdmin }) {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const userId = session?.user?.id

  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [oppProfiles, setOppProfiles] = useState({})
  // For waiting-state screens the other party may not be in oublex_players
  // yet — resolve their profile from the game row instead.
  const [waitingOtherProfile, setWaitingOtherProfile] = useState(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  // Auto-accept-on-arrival: when an invitee deep-links into a waiting game
  // (push tap), accept the invite once without prompting. Tapping the
  // notification is already consent. Tracks the gameId we last attempted.
  const autoAcceptAttempted = useRef(null)
  const [busy, setBusy] = useState(false)
  const [oppSheetId, setOppSheetId] = useState(null)
  const [notFound, setNotFound] = useState(false)

  // GAME-SPECIFIC demo state — the stub play area's score input.
  const [demoScore, setDemoScore] = useState(0)

  const myPlayer = players.find(p => p.user_id === userId)
  const opponents = players
    .filter(p => p.user_id !== userId)
    .sort((a, b) => a.player_index - b.player_index)
  const isMyTurn = !!(game && myPlayer && game.status === 'active' && myPlayer.player_index === game.current_player_idx)
  const isGameOver = game?.status === 'finished'
  const isWaiting = game?.status === 'waiting'
  const iAmCreator = !!(game && userId && game.created_by === userId)
  const iAmInvitee = !!(game && userId && (game.invited_user_id === userId || (game.invited_user_ids ?? []).includes(userId)))
  const iAmPlayer = !!myPlayer
  const iForfeited = !!myPlayer?.forfeited
  const seatsFilled = players.length
  const maxSeats = game?.max_players ?? 2
  const hasOpenSeat = seatsFilled < maxSeats

  // Invited friends who never joined before the game started short-handed
  // (c150). Only meaningful once the game is past 'waiting' — while waiting
  // they're still pending, not no-shows. invited_user_ids is kept on the row
  // even after the expire sweep shrinks the seats, so we can render them as
  // greyed ✗ pills.
  const noShowIds = useMemo(() => {
    if (!game || game.status === 'waiting') return []
    const seated = new Set(players.map(p => p.user_id))
    return (game.invited_user_ids ?? []).filter(id => id && !seated.has(id))
  }, [game, players])

  const refresh = useCallback(async () => {
    if (!gameId) return
    try {
      const [g, ps] = await Promise.all([loadGame(gameId), loadPlayers(gameId)])
      if (!g) { setNotFound(true); return }
      setGame(g)
      setPlayers(ps)
    } catch (err) {
      console.error('[MultiGamePage refresh]', err)
      toast.error(err.message || 'Failed to load game')
    }
  }, [gameId])

  useEffect(() => { refresh() }, [refresh])

  // Fetch profiles for opponents AND no-show invitees (for the greyed pills).
  const oppIdsKey = [...new Set([...opponents.map(o => o.user_id), ...noShowIds])].join(',')
  useEffect(() => {
    const ids = oppIdsKey ? oppIdsKey.split(',') : []
    if (!ids.length) { setOppProfiles({}); return }
    supabase.from('profiles').select('id, username, avatar_hue').in('id', ids)
      .then(({ data }) => {
        const m = {}
        for (const p of data ?? []) m[p.id] = p
        setOppProfiles(m)
      })
  }, [oppIdsKey])

  // In waiting state the invitee isn't in oublex_players yet, so resolve
  // the "other party" from the game row.
  const waitingOtherId = useMemo(() => {
    if (!isWaiting || !userId || !game) return null
    if (iAmCreator) return game.invited_user_id ?? null // null for open games
    return game.created_by
  }, [isWaiting, userId, game, iAmCreator])

  useEffect(() => {
    if (!waitingOtherId) { setWaitingOtherProfile(null); return }
    let cancelled = false
    supabase.from('profiles').select('id, username, avatar_hue').eq('id', waitingOtherId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setWaitingOtherProfile(data ?? null) })
    return () => { cancelled = true }
  }, [waitingOtherId])

  // Auto-accept the invite when an invitee lands on /multi/<id> via a push
  // notification. Without this they'd see an empty board (not in
  // oublex_players yet). Fire at most once per gameId, only if I'm the
  // invitee and not already seated.
  useEffect(() => {
    if (!gameId || !isWaiting || !iAmInvitee || iAmPlayer) return
    if (autoAcceptAttempted.current === gameId) return
    autoAcceptAttempted.current = gameId
    setInviteBusy(true)
    acceptInvite(gameId)
      .then(() => refresh())
      .catch(err => toast.error(err.message || 'Failed to accept invite'))
      .finally(() => setInviteBusy(false))
  }, [gameId, isWaiting, iAmInvitee, iAmPlayer, refresh])

  useRealtimeChannel({
    channelName: `game-oublex-${gameId}`,
    subscriptions: gameId ? [
      { event: 'UPDATE', schema: 'public', table: 'oublex_games',   filter: `id=eq.${gameId}` },
      { event: '*',      schema: 'public', table: 'oublex_players', filter: `game_id=eq.${gameId}` },
    ] : [],
    onChange: refresh,
    pollMs: 15_000,
    enabled: !!gameId,
  })

  async function withBusy(fn) {
    if (busy) return
    setBusy(true)
    try { await fn() }
    catch (err) { toast.error(err.message || 'Action failed') }
    finally { setBusy(false); refresh() }
  }

  // GAME-SPECIFIC: this calls the stub oublex_submit_turn RPC with a
  // client-supplied integer. Replace with your real move submission.
  function handleSubmitTurn() {
    if (!isMyTurn) return
    withBusy(async () => {
      await submitTurn(gameId, Number(demoScore) || 0)
      toast.success('Turn submitted')
      setDemoScore(0)
    })
  }

  async function handleForfeit() {
    const others = opponents.filter(o => !o.forfeited).length
    const msg = others > 1
      ? "Forfeit? You'll take a loss and the others keep playing."
      : 'Forfeit this game? You’ll take a loss.'
    if (!confirm(msg)) return
    withBusy(() => forfeitGame(gameId))
  }

  async function handleClaim() {
    if (!confirm('Claim the win — your opponent has been inactive 7+ days?')) return
    withBusy(() => claimInactiveWin(gameId))
  }

  async function handleCancelInvite() {
    if (inviteBusy) return
    if (!confirm('Cancel this game?')) return
    setInviteBusy(true)
    try {
      await cancelInvite(gameId)
      navigate('/')
    } catch (err) {
      toast.error(err.message || 'Failed to cancel')
      setInviteBusy(false)
    }
  }

  async function handleJoinOpen() {
    if (inviteBusy) return
    setInviteBusy(true)
    try {
      await joinOpenGame(gameId)
      toast.success('Game on!')
      await refresh()
    } catch (err) {
      toast.error(err.message || 'Failed to join')
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleRematch() {
    try {
      await rematch(gameId)
      toast.success('Rematch invite sent!')
      navigate('/')
    } catch (err) {
      toast.error(err.message || 'Rematch failed')
    }
  }

  const currentPlayer = players.find(p => p.player_index === game?.current_player_idx) ?? null
  const currentName = currentPlayer
    ? (currentPlayer.user_id === userId ? 'You' : (oppProfiles[currentPlayer.user_id]?.username ?? 'Opponent'))
    : ''

  // canClaim = it's the opponent's turn in an active game AND they've been idle
  // past 7 days. The cog row is always shown (below) and greyed unless this holds.
  const canClaim = (() => {
    if (!game || game.status !== 'active' || !myPlayer) return false
    if (myPlayer.player_index === game.current_player_idx) return false
    if (!game.last_activity_at) return false
    const age = Date.now() - new Date(game.last_activity_at).getTime()
    return age > 7 * 24 * 60 * 60 * 1000
  })()

  // Game-specific cog rows (Claim win / Forfeit), injected into the shared
  // settings dropdown. Claim is ALWAYS shown for an in-play game (so it's
  // consistently discoverable) and greyed out unless actually claimable.
  const cogGameRows = (!isGameOver && !iForfeited && game?.status === 'active')
    ? (close) => (
        <>
          <SQSettingsRow
            label="Claim win (opponent inactive)"
            disabled={!canClaim}
            title={canClaim
              ? 'Claim the win — opponent inactive 7+ days'
              : 'Available once your opponent has been inactive for 7 days'}
            onClick={() => { close(); handleClaim() }}
          />
          <SQSettingsRow
            label="Forfeit game"
            danger
            onClick={() => { close(); handleForfeit() }}
          />
        </>
      )
    : null

  return (
    <SQBoardShell
      width="narrow"
      header={
        <SQLobbyHeader
          title="Oublex"
          avatarSlot={<AvatarMenu profile={profile} />}
          rightSlot={<HeaderRight isAdmin={isAdmin} gameRows={cogGameRows} />}
        />
      }
      subHeader={
        <SQBoardHeader
          backLabel="← Lobby"
          onBackClick={() => navigate('/')}
          centerSlot={
            <span className="text-sm opacity-80">
              {isGameOver
                ? 'Final'
                : game?.status === 'active'
                  ? (isMyTurn ? 'Your turn' : `${currentName}'s turn`)
                  : ''}
            </span>
          }
          /* Claim win + Forfeit now live in the cog menu (c153 revision) so the
             board chrome stays clean and they're identical across SQ games. */
        />
      }
    >
      <div className="py-2 px-2 space-y-2">

        {notFound && (
          <div className="card p-4 text-center text-sm opacity-80">
            This game doesn't exist or you're not a participant.
          </div>
        )}

        {/* Score pills — one per player in seat order; the current player's
            pill is lit (✨). Tap an opponent's pill to inspect them. */}
        {game && iAmPlayer && (
          <div className="flex flex-wrap gap-2 justify-center">
            {[...(myPlayer ? [myPlayer] : []), ...opponents]
              .sort((a, b) => a.player_index - b.player_index)
              .map(p => {
                const isMe = p.user_id === userId
                const prof = isMe ? profile : oppProfiles[p.user_id]
                const nm = isMe ? `${prof?.username ?? 'You'} (you)` : (prof?.username ?? 'Player')
                return (
                  <PlayerPill
                    key={p.user_id}
                    name={nm}
                    score={p.total_score ?? 0}
                    isCurrent={!isGameOver && game.status === 'active' && p.player_index === game.current_player_idx}
                    isWinner={isGameOver && p.is_winner}
                    isOut={p.forfeited}
                    onClick={isMe ? undefined : () => setOppSheetId(p.user_id)}
                  />
                )
              })}
            {/* No-show invitees on a short-handed game — greyed ✗ pills, no
                score (they never played), not tappable. (c150) */}
            {noShowIds.map(id => (
              <PlayerPill
                key={`noshow-${id}`}
                name={oppProfiles[id]?.username ?? 'Player'}
                noShow
              />
            ))}
          </div>
        )}

        {/* Join/accept prompt — for a viewer who isn't seated yet. */}
        {isWaiting && !iAmPlayer && (
          <WaitingCard
            otherName={waitingOtherProfile?.username}
            iAmCreator={iAmCreator}
            iAmInvitee={iAmInvitee}
            iAmPlayer={iAmPlayer}
            seatsFilled={seatsFilled}
            maxSeats={maxSeats}
            hasOpenSeat={hasOpenSeat}
            inviteBusy={inviteBusy}
            onCancel={handleCancelInvite}
            onJoinOpen={handleJoinOpen}
            onBack={() => navigate('/')}
          />
        )}

        {/* Game over — N-column comparison + rematch. */}
        {isGameOver && game && (
          <GameOverComparison
            game={game}
            players={players}
            profiles={{ ...oppProfiles, [userId]: profile }}
            myUserId={userId}
            onRematch={handleRematch}
          />
        )}

        {/* I forfeited but the game's still going for the others. */}
        {!isGameOver && iForfeited && game?.status === 'active' && (
          <div className="card p-5 text-center space-y-2">
            <div className="text-3xl">🏳️</div>
            <div className="font-display text-xl text-wordy-700">You forfeited</div>
            <p className="text-sm opacity-70">The game's continuing without you — check back later for the result.</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-1 text-sm px-3 py-1.5 rounded-lg border border-wordy-200 text-wordy-600 hover:bg-wordy-50"
            >
              ← Back to lobby
            </button>
          </div>
        )}

        {/* Active board / waiting room for a seated, non-forfeited player. */}
        {!isGameOver && iAmPlayer && !iForfeited && (game?.status === 'active' || isWaiting) && (
          <>
            {isWaiting ? (
              <div className="card p-4 text-center">
                <div className="text-2xl mb-1">⏳</div>
                <div className="text-sm font-semibold">
                  Waiting for {Math.max(0, maxSeats - seatsFilled)} more player{maxSeats - seatsFilled === 1 ? '' : 's'}
                </div>
                <div className="text-[11px] opacity-60 mt-1">
                  {seatsFilled} of {maxSeats} seats filled — the game starts when everyone's in.
                </div>
                {iAmCreator && (
                  <button
                    type="button"
                    onClick={handleCancelInvite}
                    disabled={inviteBusy}
                    className="mt-3 text-xs px-3 py-1.5 rounded-full border border-white/15 opacity-70 hover:opacity-100 disabled:opacity-40"
                  >
                    Cancel game
                  </button>
                )}
              </div>
            ) : (
              // ──────────────────────────────────────────────────────────
              // GAME-SPECIFIC PLAY AREA — replace this whole block with your
              // board / dice / word builder / cards / etc.
              //
              // This demo control just submits a client-chosen integer to the
              // stub oublex_submit_turn RPC so you can watch the turn engine
              // work end-to-end (turns rotate between seats; the game finalizes
              // when everyone has taken oublex_total_turns() turns and a
              // top-score winner is picked). When it isn't your turn, it shows
              // whose turn it is + the claim-inactive-win affordance.
              // ──────────────────────────────────────────────────────────
              <div className="card p-4 space-y-3">
                <div className="text-[10px] uppercase tracking-wide opacity-50 font-bold text-center">
                  Demo play area — replace with real gameplay
                </div>
                {isMyTurn ? (
                  <div className="space-y-3 text-center">
                    <div className="text-sm font-semibold">Your turn — submit a score</div>
                    <input
                      type="number"
                      value={demoScore}
                      onChange={(e) => setDemoScore(e.target.value)}
                      className="w-32 mx-auto block text-center bg-black/20 dark:bg-black/40 border border-wordy-200 dark:border-white/10 rounded-lg px-3 py-2 text-lg font-display"
                    />
                    <button
                      type="button"
                      onClick={handleSubmitTurn}
                      disabled={busy}
                      className="btn-primary disabled:opacity-50"
                    >
                      Submit turn
                    </button>
                  </div>
                ) : (
                  <div className="text-center opacity-80">
                    <div className="text-sm font-semibold">{currentName} is playing…</div>
                    <div className="text-[11px] opacity-60 mt-1">Tap a player's pill above to inspect them</div>
                    {/* Claim lives in the always-visible sub-header (c153). */}
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </div>

      {oppSheetId && (() => {
        const op = opponents.find(o => o.user_id === oppSheetId)
        if (!op) return null
        // GAME-SPECIFIC: replace this minimal inspector with your opponent
        // detail sheet (their board / scorecard / hand, as appropriate).
        return (
          <OpponentSheet
            player={op}
            profile={oppProfiles[oppSheetId]}
            onClose={() => setOppSheetId(null)}
          />
        )
      })()}
    </SQBoardShell>
  )
}

function WaitingCard({
  otherName, iAmCreator, iAmInvitee, iAmPlayer, seatsFilled, maxSeats, hasOpenSeat,
  inviteBusy, onCancel, onJoinOpen, onBack,
}) {
  const display = otherName || 'Someone'

  // Already seated — the game is filling up.
  if (iAmPlayer) {
    const need = Math.max(0, maxSeats - seatsFilled)
    return (
      <div className="card p-5 text-center space-y-3">
        <div className="text-3xl">⏳</div>
        <div>
          <div className="font-display text-xl text-wordy-700">
            Waiting for {need} more player{need === 1 ? '' : 's'}
          </div>
          <p className="text-sm opacity-70 mt-1">
            {seatsFilled} of {maxSeats} seats filled — starts automatically when full.
          </p>
        </div>
        <div className="flex gap-2 justify-center pt-1">
          <button type="button" onClick={onBack} className="text-sm px-3 py-1.5 rounded-lg border border-wordy-200 text-wordy-600 hover:bg-wordy-50">← Lobby</button>
          {iAmCreator && (
            <button type="button" onClick={onCancel} disabled={inviteBusy} className="text-sm px-3 py-1.5 rounded-lg text-wordy-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50">Cancel game</button>
          )}
        </div>
      </div>
    )
  }

  // Invited but not yet seated — auto-accept runs in the parent effect.
  if (iAmInvitee) {
    return (
      <div className="card p-5 text-center space-y-3">
        <div className="text-3xl">📨</div>
        <div className="font-display text-xl text-wordy-700">Accepting invite from {display}…</div>
        <p className="text-sm opacity-70">Setting up your game.</p>
      </div>
    )
  }

  // Not invited, but a seat is open — offer to join.
  if (hasOpenSeat) {
    return (
      <div className="card p-5 text-center space-y-3">
        <div className="text-3xl">🎲</div>
        <div>
          <div className="font-display text-xl text-wordy-700">{display} has an open game</div>
          <p className="text-sm opacity-70 mt-1">{seatsFilled} of {maxSeats} seats filled — join to take one.</p>
        </div>
        <div className="flex gap-2 justify-center pt-1">
          <button type="button" onClick={onJoinOpen} disabled={inviteBusy} className="btn-primary bg-amber-500 hover:bg-amber-600 disabled:opacity-50">Join game</button>
          <button type="button" onClick={onBack} className="text-sm px-3 py-1.5 rounded-lg border border-wordy-200 text-wordy-600 hover:bg-wordy-50">← Lobby</button>
        </div>
      </div>
    )
  }

  return <div className="card p-4 text-center text-sm opacity-80">This game is full.</div>
}

function PlayerPill({ name, score, isCurrent, isWinner, isOut, noShow, onClick }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold transition-all'
  // noShow = invited friend who never joined a short-handed game (c150).
  // Same muted treatment as a forfeited pill but without the strike-through,
  // marked with ✗ and no score (they never played).
  const cls = noShow
    ? 'bg-white/5 border border-white/10 text-wordy-400/60'
    : isOut
      ? 'bg-white/5 border border-white/10 text-wordy-400/60 line-through'
      : isWinner
        ? 'bg-yellow-50 border-2 border-yellow-400 text-yellow-800'
        : isCurrent
          ? 'bg-wordy-200 border-2 border-wordy-500 text-wordy-800'
          : 'bg-wordy-50 border border-wordy-200 text-wordy-500'
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag onClick={onClick} className={`${base} ${cls}`}>
      {noShow && <span className="text-[11px]">✗</span>}
      {!noShow && isOut && <span className="no-underline">🏳️</span>}
      {!noShow && !isOut && isWinner && <span>🏆</span>}
      {!noShow && !isOut && !isWinner && isCurrent && <span>✨</span>}
      <span>{name}</span>
      {!noShow && <span className={`font-display text-sm ${isOut ? '' : 'text-wordy-800'}`}>{score}</span>}
    </Tag>
  )
}

// N-column final comparison. Uses the canonical 4-branch headline so
// admin-closed games + ties never read as a false "highest score wins".
function GameOverComparison({ game, players, profiles, myUserId, onRematch }) {
  const sorted = players.slice().sort((a, b) => a.player_index - b.player_index)
  const nameFor = (id) => (id === myUserId ? (profiles[id]?.username ?? 'You') : (profiles[id]?.username ?? 'Player'))
  const winners = sorted.filter(p => p.is_winner)
  const winnerNames = winners.map(p => nameFor(p.user_id)).join(' & ')
  const closedNoShow = game.closed_reason === 'no_other_players'
  const headline = closedNoShow
    ? '🚫 Game closed'
    : game.closed_by_admin
      ? '🛑 Game closed by admin'
      : game.forfeit_user_id
        ? `🏳️ ${nameFor(game.forfeit_user_id)} forfeited — ${winnerNames || 'opponent'} wins!`
        : winners.length === 1
          ? `🏆 ${winnerNames} wins!`
          : winners.length > 1
            ? `🤝 Tie — ${winnerNames}`
            : "🤝 It's a tie!"
  return (
    <div className="card p-4 space-y-3 text-center">
      <div className="font-display text-xl text-wordy-700">{headline}</div>
      {closedNoShow ? (
        // Never started — no scores to compare, no rematch (there was no
        // opponent). Just explain why it closed.
        <p className="text-sm opacity-70">
          Invite expired — this game closed because no other players joined.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 justify-center">
            {sorted.map(p => (
              <div
                key={p.user_id}
                className={`rounded-xl px-4 py-3 border ${p.is_winner ? 'border-yellow-400 bg-yellow-50' : 'border-wordy-200 bg-wordy-50'} ${p.forfeited ? 'opacity-60' : ''}`}
              >
                <div className="text-xs font-semibold">{nameFor(p.user_id)}{p.forfeited ? ' 🏳️' : ''}</div>
                <div className="font-display text-2xl text-wordy-800">{p.total_score ?? 0}</div>
              </div>
            ))}
          </div>
          <button type="button" onClick={onRematch} className="btn-primary">🔄 Rematch</button>
        </>
      )}
    </div>
  )
}

function OpponentSheet({ player, profile, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full sm:max-w-sm mx-auto bg-[#181c25] rounded-t-2xl sm:rounded-2xl border border-white/10 p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg">{profile?.username ?? 'Player'}</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">×</button>
        </div>
        <p className="text-sm opacity-80">
          Score: <span className="font-display text-lg">{player.total_score ?? 0}</span>
          {player.forfeited && <span className="ml-2 opacity-60">· forfeited</span>}
        </p>
        <p className="text-[11px] opacity-50 mt-2">
          GAME-SPECIFIC: show this opponent's board / scorecard / hand here.
        </p>
      </div>
    </div>
  )
}
