/**
 * WebSocket route + connection lifecycle.
 */

import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import { manager } from './ws.manager.js'
import { handleWsMessage, handleReconnect } from './ws.handler.js'
import { getEnv } from '../../config/env.js'
import jwt from 'jsonwebtoken'

const COOKIE_NAME = 'sid'

export async function wsRoute(app: FastifyInstance) {
  app.get('/ws/:matchCode', { websocket: true }, (socket: WebSocket, request) => {
    const matchCode = (request.params as any).matchCode as string

    // Extract session from cookie or query param
    const cookies = parseCookies(request.headers.cookie || '')
    const sid = cookies[COOKIE_NAME] || (request.query as any).sid

    if (!sid) {
      socket.close(4001, 'Missing authentication')
      return
    }

    // For now, extract user info from JWT token (query param)
    // In production, this should use Valkey session lookup
    const token = (request.query as any).token as string
    if (!token) {
      socket.close(4001, 'Missing authentication token')
      return
    }

    let userCode: string
    let role: string
    try {
      const env = getEnv()
      const payload = jwt.verify(token, env.SESSION_SECRET) as any
      userCode = payload.user_code
      role = payload.role
    } catch {
      socket.close(4001, 'Invalid token')
      return
    }

    const conn = {
      ws: socket,
      matchCode,
      userId: userCode,
      userCode,
      role: role as 'admin' | 'mc' | 'player',
      sid,
    }

    // Register connection
    manager.connect(socket, matchCode, userCode, role, sid)

    // Handle reconnect
    handleReconnect(conn)

    // Message handler
    socket.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString())
        await handleWsMessage(socket, conn, data)
      } catch { /* ignore malformed messages */ }
    })

    // Disconnect handler
    socket.on('close', () => {
      manager.disconnect(socket)
    })
  })
}

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const pair of header.split(';')) {
    const [key, ...rest] = pair.split('=')
    if (key) cookies[key.trim()] = rest.join('=').trim()
  }
  return cookies
}
