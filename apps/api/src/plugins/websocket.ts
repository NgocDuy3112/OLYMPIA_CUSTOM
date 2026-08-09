import type { FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'

export async function registerWebSocket(app: FastifyInstance) {
  await app.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
      clientTracking: true,
    },
  })
}
