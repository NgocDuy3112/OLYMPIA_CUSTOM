/**
 * WebSocket connection manager.
 *
 * Manages connections per room, provides broadcast/unicast,
 * and bridges to Valkey pub/sub for cross-instance support.
 */

import type Redis from 'ioredis'
import type { WebSocket } from 'ws'
import type { WsConnection } from './ws.types.js'

class ConnectionManager {
  private rooms = new Map<string, Set<WsConnection>>()
  private wsToConn = new WeakMap<WebSocket, WsConnection>()
  valkey: Redis | null = null

  setValkey(valkey: Redis) {
    this.valkey = valkey
  }

  connect(
    ws: WebSocket,
    matchCode: string,
    userCode: string,
    role: string,
    sid: string,
  ): void {
    const conn: WsConnection = {
      ws,
      matchCode,
      userId: userCode,
      userCode,
      role: role as WsConnection['role'],
      sid,
    }

    if (!this.rooms.has(matchCode)) {
      this.rooms.set(matchCode, new Set())
    }
    this.rooms.get(matchCode)!.add(conn)
    this.wsToConn.set(ws, conn)
  }

  disconnect(ws: WebSocket): void {
    const conn = this.wsToConn.get(ws)
    if (!conn) return

    const room = this.rooms.get(conn.matchCode)
    if (room) {
      // Find and delete the WsConnection containing this ws
      for (const c of room) {
        if (c.ws === ws) { room.delete(c); break }
      }
      if (room.size === 0) this.rooms.delete(conn.matchCode)
    }
    this.wsToConn.delete(ws)
  }

  getConnection(ws: WebSocket): WsConnection | undefined {
    return this.wsToConn.get(ws)
  }

  userCodesInRoom(matchCode: string): string[] {
    const room = this.rooms.get(matchCode)
    if (!room) return []
    const seen = new Set<string>()
    const codes: string[] = []
    for (const conn of room) {
      if (!seen.has(conn.userCode)) {
        seen.add(conn.userCode)
        codes.push(conn.userCode)
      }
    }
    return codes
  }

  async sendToRoom(matchCode: string, payload: Record<string, unknown>): Promise<void> {
    const room = this.rooms.get(matchCode)
    if (!room || room.size === 0) return

    const msg = JSON.stringify(payload)
    const dead: WsConnection[] = []

    for (const conn of room) {
      try {
        if (conn.ws.readyState === 1) {
          conn.ws.send(msg)
        } else {
          dead.push(conn)
        }
      } catch {
        dead.push(conn)
      }
    }

    for (const conn of dead) {
      room.delete(conn)
      this.wsToConn.delete(conn.ws)
    }
  }

  async sendToUser(matchCode: string, userCode: string, payload: Record<string, unknown>): Promise<void> {
    const room = this.rooms.get(matchCode)
    if (!room) return

    const msg = JSON.stringify(payload)
    for (const conn of room) {
      if (conn.userCode === userCode && conn.ws.readyState === 1) {
        try { conn.ws.send(msg) } catch { /* ignore */ }
      }
    }
  }

  async sendToRoles(matchCode: string, roles: string[], payload: Record<string, unknown>): Promise<void> {
    const room = this.rooms.get(matchCode)
    if (!room) return

    const msg = JSON.stringify(payload)
    for (const conn of room) {
      if (roles.includes(conn.role) && conn.ws.readyState === 1) {
        try { conn.ws.send(msg) } catch { /* ignore */ }
      }
    }
  }

  async broadcast(matchCode: string, payload: Record<string, unknown>): Promise<void> {
    // Send locally
    await this.sendToRoom(matchCode, payload)

    // Publish to Valkey for cross-instance
    if (this.valkey) {
      try {
        await this.valkey.publish(`events:${matchCode}`, JSON.stringify(payload))
      } catch {
        // Valkey publish failure is non-fatal
      }
    }
  }

  shutdown(): void {
    this.rooms.clear()
  }
}

export const manager = new ConnectionManager()
