// Supabase Edge Function: oublex-push-notification
//
// Deploy with:
//   supabase functions deploy oublex-push-notification
//
// Trigger / call types — all sourced from oublex_games row events
// (see oublex_multiplayer.sql section 20 + oublex_nudge.sql):
//   1. game_invited     — oublex_games AFTER INSERT (invitee[s] set).
//                         Fans out to every invited user.
//   2. opponent_joined  — oublex_games AFTER UPDATE, waiting→active.
//                         Notifies the creator.
//   3. turn_change      — oublex_games AFTER UPDATE, current_player_idx
//                         changed while status='active'. Notifies the new
//                         current player. One ping per turn change.
//   4. game_finished    — oublex_games AFTER UPDATE, active→finished.
//                         Fans out to every player (won / lost / tie /
//                         you forfeited), using oublex_players.is_winner.
//   5. nudge            — client POST (after the oublex_nudge RPC stamps
//                         the 12h cooldown). Reminds the current player.
//   6. game_closed      — oublex_expire_stale_invites closed a
//                         never-filled game (only the creator was seated).
//                         Notifies the lone creator. (c150 policy)
//
// Reuses the shared push_subscriptions table. Subscription fallback
// order: ['sidequest', 'oublex'] — most users opt in via the SQ hub.
// Respects per-user/game/topic prefs via sq_notification_enabled.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PRIVATE_KEY    = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_PUBLIC_KEY      = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_SUBJECT         = Deno.env.get('VAPID_SUBJECT')!
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP = 'oublex'
const GAME_LABEL = 'Oublex 🗝️'
const ICON = '/oublex/favicon.svg'

function gameUrl(gameId: string): string {
  return `/oublex/multi/${gameId}`
}

// Respect the recipient's notification prefs before sending. Calls
// sq_notification_enabled(user, app, topic) — if false, skip the send.
// Fail-open on RPC error so a transient DB blip doesn't break the platform.
async function sendIfOptedIn(
  supabase: any,
  userId: string,
  app: string,
  topic: string,
  payload: { title: string; body: string; tag: string; url: string; icon?: string }
): Promise<{ sent: boolean; reason?: string; via?: string }> {
  const { data: enabled, error } = await supabase.rpc('sq_notification_enabled', {
    p_user_id: userId,
    p_app: app,
    p_topic: topic,
  })
  if (error) {
    console.error('sq_notification_enabled failed (fail-open):', error)
  } else if (enabled === false) {
    return { sent: false, reason: 'opted out' }
  }
  return sendPushToUser(supabase, userId, payload)
}

async function sendPushToUser(
  supabase: any,
  userId: string,
  payload: { title: string; body: string; tag: string; url: string; icon?: string }
): Promise<{ sent: boolean; reason?: string; via?: string }> {
  const apps = ['sidequest', APP]
  for (const app of apps) {
    const { data: sub } = await supabase
      .from('push_subscriptions')
      .select('endpoint, keys_p256dh, keys_auth')
      .eq('user_id', userId)
      .eq('app', app)
      .maybeSingle()
    if (!sub) continue
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
    }
    try {
      await webpush.sendNotification(pushSubscription, JSON.stringify(payload), { TTL: 86400 })
      return { sent: true, via: app }
    } catch (pushErr: any) {
      if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('app', app)
        continue
      }
      throw pushErr
    }
  }
  return { sent: false, reason: 'no push subscription' }
}

async function getUsername(supabase: any, userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle()
  return profile?.username ?? 'Someone'
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const payload = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ── game_invited: oublex_games INSERT with invitee(s) ──
    // Fans out to every invited user (multi-friend games), falling back
    // to the single invited_user_id for 1v1 rows.
    if (payload.type === 'game_invited') {
      const { record } = payload
      const invitees: string[] = (Array.isArray(record?.invited_user_ids) && record.invited_user_ids.length)
        ? record.invited_user_ids
        : (record?.invited_user_id ? [record.invited_user_id] : [])
      if (!record?.id || !record.created_by || !invitees.length) {
        return new Response(JSON.stringify({ skipped: 'missing fields' }), { status: 200, headers: corsHeaders })
      }
      const inviterName = await getUsername(supabase, record.created_by)
      const results: any[] = []
      for (const inviteeId of invitees) {
        const r = await sendIfOptedIn(supabase, inviteeId, APP, 'invite', {
          title: `${GAME_LABEL} — game invite`,
          body: `${inviterName} invited you to a ${GAME_LABEL} game. Tap to play!`,
          tag: `oublex-invite-${record.id}`,
          url: gameUrl(record.id),
          icon: ICON,
        })
        results.push({ user_id: inviteeId, ...r })
      }
      return new Response(JSON.stringify({ results }), { status: 200, headers: corsHeaders })
    }

    // ── opponent_joined: oublex_games UPDATE waiting→active ──
    if (payload.type === 'opponent_joined') {
      const { record } = payload
      if (!record?.id || !record.created_by || !record.invited_user_id) {
        return new Response(JSON.stringify({ skipped: 'missing fields' }), { status: 200, headers: corsHeaders })
      }
      const joinerName = await getUsername(supabase, record.invited_user_id)
      const result = await sendIfOptedIn(supabase, record.created_by, APP, 'opponent_joined', {
        title: `${GAME_LABEL} — opponent joined!`,
        body: `${joinerName} joined your game. Time to play!`,
        tag: `oublex-join-${record.id}`,
        url: gameUrl(record.id),
        icon: ICON,
      })
      return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders })
    }

    // ── turn_change: oublex_games UPDATE current_player_idx changed ──
    if (payload.type === 'turn_change') {
      const { record, old_record } = payload
      if (!record || record.status !== 'active') {
        return new Response(JSON.stringify({ skipped: 'game not active' }), { status: 200, headers: corsHeaders })
      }
      if (old_record && record.current_player_idx === old_record.current_player_idx) {
        return new Response(JSON.stringify({ skipped: 'turn did not change' }), { status: 200, headers: corsHeaders })
      }

      const { data: currentPlayer } = await supabase
        .from('oublex_players')
        .select('user_id')
        .eq('game_id', record.id)
        .eq('player_index', record.current_player_idx)
        .single()
      if (!currentPlayer) {
        return new Response(JSON.stringify({ skipped: 'player not found' }), { status: 200, headers: corsHeaders })
      }

      let moverName = 'Opponent'
      if (old_record && old_record.current_player_idx != null) {
        const { data: mover } = await supabase
          .from('oublex_players')
          .select('user_id')
          .eq('game_id', record.id)
          .eq('player_index', old_record.current_player_idx)
          .single()
        if (mover) moverName = await getUsername(supabase, mover.user_id)
      }

      const result = await sendIfOptedIn(supabase, currentPlayer.user_id, APP, 'your_turn', {
        title: `${GAME_LABEL} — your turn!`,
        body: `${moverName} played. Your move!`,
        tag: `oublex-turn-${record.id}`,
        url: gameUrl(record.id),
        icon: ICON,
      })
      return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders })
    }

    // ── game_finished: oublex_games UPDATE active→finished ──
    // Fans out to every player. Outcome comes from oublex_players.is_winner
    // (authoritative for N players — the top-score group all win, so a
    // tie-for-first reads as a win for each tied player).
    if (payload.type === 'game_finished') {
      const { record } = payload
      if (!record?.id) {
        return new Response(JSON.stringify({ skipped: 'missing fields' }), { status: 200, headers: corsHeaders })
      }
      // Admin closes are silent — only used to clean up stuck test games.
      if (record.closed_by_admin) {
        return new Response(JSON.stringify({ skipped: 'closed_by_admin' }), { status: 200, headers: corsHeaders })
      }

      const { data: pls } = await supabase
        .from('oublex_players')
        .select('user_id, is_winner')
        .eq('game_id', record.id)
      const playerRows = pls ?? []
      if (!playerRows.length) {
        return new Response(JSON.stringify({ skipped: 'no players' }), { status: 200, headers: corsHeaders })
      }

      const winners = playerRows.filter((p: any) => p.is_winner)
      const winnerIds = new Set(winners.map((p: any) => p.user_id))
      const winnerNames: string[] = []
      for (const w of winners) winnerNames.push(await getUsername(supabase, w.user_id))
      const winnerLabel = winnerNames.join(' & ') || 'Someone'
      const tie = winners.length > 1

      const results: any[] = []
      for (const p of playerRows) {
        const userId = p.user_id
        let title = `${GAME_LABEL} — game over`
        let body: string

        if (record.forfeit_user_id === userId) {
          if (record.end_reason === 'claim') {
            // Claimed against while idle — NOT a voluntary forfeit.
            body = `${winnerLabel} claimed the win because your turn was idle 7+ days.`
          } else {
            body = 'You forfeited the game.'
          }
        } else if (winnerIds.has(userId)) {
          title = `${GAME_LABEL} — you won!`
          if (record.end_reason === 'forfeit' && !tie) {
            body = `${await getUsername(supabase, record.forfeit_user_id)} forfeited, you win!`
          } else {
            body = tie ? 'You tied for 1st! 🏆' : 'You won! 🏆'
          }
        } else {
          body = `${winnerLabel} won${tie ? ' (tie)' : ''}. Rematch?`
        }

        const r = await sendIfOptedIn(supabase, userId, APP, 'game_finished', {
          title,
          body,
          tag: `oublex-finish-${record.id}`,
          url: gameUrl(record.id),
          icon: ICON,
        })
        results.push({ user_id: userId, ...r })
      }
      return new Response(JSON.stringify({ results }), { status: 200, headers: corsHeaders })
    }

    // ── game_closed: expire sweep closed a never-filled game ──
    // Only fires when just the creator was seated at expiry (unplayable),
    // so there's exactly one recipient. Reuses the game_finished pref
    // bucket so it honors the same opt-out.
    if (payload.type === 'game_closed') {
      const { record } = payload
      if (!record?.id || !record.created_by) {
        return new Response(JSON.stringify({ skipped: 'missing fields' }), { status: 200, headers: corsHeaders })
      }
      const result = await sendIfOptedIn(supabase, record.created_by, APP, 'game_finished', {
        title: `${GAME_LABEL} — game closed`,
        body: 'Your game closed because no one else joined in time.',
        tag: `oublex-closed-${record.id}`,
        url: gameUrl(record.id),
        icon: ICON,
      })
      return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders })
    }

    // ── nudge: client POST, remind the current player it's their turn ──
    // The oublex_nudge RPC has already validated eligibility + stamped
    // the cooldown; we just look up who to ping and send.
    if (payload.type === 'nudge') {
      const { game_id, nudger_name } = payload
      const { data: game } = await supabase
        .from('oublex_games')
        .select('current_player_idx, status')
        .eq('id', game_id)
        .single()
      if (!game || game.status !== 'active') {
        return new Response(JSON.stringify({ skipped: 'game not active' }), { status: 200, headers: corsHeaders })
      }
      const { data: currentPlayer } = await supabase
        .from('oublex_players')
        .select('user_id')
        .eq('game_id', game_id)
        .eq('player_index', game.current_player_idx)
        .single()
      if (!currentPlayer) {
        return new Response(JSON.stringify({ skipped: 'player not found' }), { status: 200, headers: corsHeaders })
      }
      const result = await sendIfOptedIn(supabase, currentPlayer.user_id, APP, 'nudge', {
        title: `${GAME_LABEL} — your turn!`,
        body: `${nudger_name || 'Someone'} is waiting for your move! 🔔`,
        tag: `oublex-nudge-${game_id}`,
        url: gameUrl(game_id),
        icon: ICON,
      })
      return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ skipped: 'unknown type' }), { status: 200, headers: corsHeaders })
  } catch (err: any) {
    console.error('Oublex push notification error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
