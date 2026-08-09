/**
 * WebSocket message handler.
 */

import type { WebSocket } from 'ws'
import type { WsConnection, WsMessage } from './ws.types.js'
import { isAllowedByRole } from './ws.types.js'
import { manager } from './ws.manager.js'
import { matchState } from '../../state/match-state.js'
import { tryAcquireBuzzerLock, setBuzzerWinner, getBuzzerWinners } from '../../state/locks.js'

export async function handleWsMessage(
  _ws: WebSocket,
  conn: WsConnection,
  data: WsMessage,
): Promise<void> {
  const msgType = data.type || ''

  if (msgType === 'user_online' || !data.user_code) {
    data.user_code = conn.userCode
  }
  data.role = conn.role

  if (!isAllowedByRole(conn.role, msgType)) return
  if (msgType === 'user_online' && data.status === 'heartbeat') return

  if (msgType === 'request_snapshot') {
    await sendSnapshot(conn)
    return
  }

  if (msgType === 'buzz') {
    await handleBuzz(conn, data)
    return
  }

  await manager.broadcast(conn.matchCode, data as Record<string, unknown>)
}

async function handleBuzz(conn: WsConnection, data: WsMessage): Promise<void> {
  const questionCode = data.question_code as string
  if (!questionCode) return

  const valkey = manager.valkey
  if (!valkey) return

  const token = await tryAcquireBuzzerLock(valkey, conn.matchCode, questionCode)
  if (!token) {
    await manager.sendToUser(conn.matchCode, conn.userCode, {
      type: 'blocked_buzz',
      question_code: questionCode,
      user_code: conn.userCode,
    })
    return
  }

  await setBuzzerWinner(valkey, conn.matchCode, questionCode, conn.userCode)
  await manager.broadcast(conn.matchCode, {
    type: 'buzzer_winner',
    user_code: conn.userCode,
    match_code: conn.matchCode,
    question_code: questionCode,
  })
}

async function sendSnapshot(conn: WsConnection): Promise<void> {
  const valkey = manager.valkey
  if (!valkey) return

  try {
    const messages = await matchState.getSnapshotMessages(valkey, conn.matchCode)
    for (const msg of messages) {
      try {
        if (conn.ws.readyState === 1) {
          conn.ws.send(JSON.stringify(msg))
        }
      } catch { /* ignore */ }
    }
  } catch { /* non-fatal */ }
}

export async function handleReconnect(conn: WsConnection): Promise<void> {
  const valkey = manager.valkey
  if (!valkey) return

  await manager.broadcast(conn.matchCode, {
    type: `${conn.role}_reconnected`,
    user_code: conn.userCode,
  })

  try {
    const winners = await getBuzzerWinners(valkey, conn.matchCode)
    for (const [questionCode, winnerCode] of Object.entries(winners)) {
      if (conn.ws.readyState === 1) {
        conn.ws.send(JSON.stringify({
          type: 'buzzer_winner',
          user_code: winnerCode,
          match_code: conn.matchCode,
          question_code: questionCode,
        }))
      }
    }
  } catch { /* non-fatal */ }
}
