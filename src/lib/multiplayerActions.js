import { supabase } from './supabase.js'

// Thin wrappers around the Oublex multiplayer RPCs (see
// supabase/migrations/oublex_multiplayer.sql + oublex_nudge.sql).
// All game-state mutations go server-side (SECURITY DEFINER) — this file
// just relays. This is the GENERIC multiplayer surface; the only
// game-specific call here is submitTurn (the stub turn RPC).

// Create a multiplayer game. invitedUserIds empty => an OPEN game any
// user can join (server caps one open game per creator). maxPlayers is
// 2–4; reserved invitee seats + open seats fill to that count.
export async function createGame({ invitedUserIds = [], maxPlayers = 2 } = {}) {
  const { data, error } = await supabase.rpc('oublex_create_game', {
    p_invited_user_ids: invitedUserIds.length ? invitedUserIds : null,
    p_max_players: maxPlayers,
  })
  if (error) throw error
  return { gameId: data }
}

export async function acceptInvite(gameId) {
  const { error } = await supabase.rpc('oublex_accept_invite', { p_game_id: gameId })
  if (error) throw error
}

// Join any waiting game with a free seat (open or one you're invited to).
// Server assigns the next player_index and auto-starts when full.
export async function joinGame(gameId) {
  const { error } = await supabase.rpc('oublex_join_game', { p_game_id: gameId })
  if (error) throw error
}

// Back-compat alias — the join path is unified server-side.
export async function joinOpenGame(gameId) {
  const { error } = await supabase.rpc('oublex_join_open_game', { p_game_id: gameId })
  if (error) throw error
}

export async function listOpenGames() {
  const { data, error } = await supabase.rpc('oublex_list_open_games')
  if (error) throw error
  return data ?? []
}

export async function declineInvite(gameId) {
  const { error } = await supabase.rpc('oublex_decline_invite', { p_game_id: gameId })
  if (error) throw error
}

export async function cancelInvite(gameId) {
  const { error } = await supabase.rpc('oublex_cancel_invite', { p_game_id: gameId })
  if (error) throw error
}

// ── GAME-SPECIFIC: submit a turn ──────────────────────────────
// Calls the STUB oublex_submit_turn(p_game_id, p_score) RPC, which just
// adds an integer to the caller's total_score + advances the turn. Replace
// this with your real move RPC (and its real payload) once you build
// gameplay — see the big comment on oublex_submit_turn in the migration.
export async function submitTurn(gameId, score) {
  const { error } = await supabase.rpc('oublex_submit_turn', {
    p_game_id: gameId,
    p_score: score,
  })
  if (error) throw error
}

export async function forfeitGame(gameId) {
  const { error } = await supabase.rpc('oublex_forfeit_game', { p_game_id: gameId })
  if (error) throw error
}

export async function claimInactiveWin(gameId) {
  const { error } = await supabase.rpc('oublex_claim_inactive_win', { p_game_id: gameId })
  if (error) throw error
}

// Nudge the current player that it's their turn. The RPC validates the
// caller is a waiting participant + enforces the 12h cooldown server-side;
// the push to the current player is fire-and-forget so the UI stays snappy.
export async function sendNudge(gameId, nudgerName) {
  const { error } = await supabase.rpc('oublex_nudge', { p_game_id: gameId })
  if (error) throw error
  fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oublex-push-notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ type: 'nudge', game_id: gameId, nudger_name: nudgerName }),
  }).catch(() => {})
}

export async function rematch(prevGameId) {
  const { data, error } = await supabase.rpc('oublex_rematch', { p_game_id: prevGameId })
  if (error) throw error
  return { gameId: data }
}

// Admin-only — gated by the shared `public.admins` table's `close_games`
// permission (RPCs in oublex_admin_close_game.sql). The RPC raises if
// the caller lacks it.
export async function adminListOpenGames() {
  const { data, error } = await supabase.rpc('oublex_admin_list_open_games')
  if (error) throw error
  return data ?? []
}

export async function adminCloseGame(gameId, reason) {
  const { error } = await supabase.rpc('oublex_admin_close_game', {
    p_game_id: gameId,
    p_reason: reason,
  })
  if (error) throw error
}

// Read-side helpers ────────────────────────────────────────────

export async function loadGame(gameId) {
  const { data, error } = await supabase
    .from('oublex_games')
    .select('*')
    .eq('id', gameId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function loadPlayers(gameId) {
  const { data, error } = await supabase
    .from('oublex_players')
    .select('*')
    .eq('game_id', gameId)
    .order('player_index')
  if (error) throw error
  return data ?? []
}
