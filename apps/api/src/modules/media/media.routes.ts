import type { FastifyInstance } from 'fastify'
import { requireRole } from '../auth/auth.service.js'

export async function mediaRoutes(app: FastifyInstance) {
  app.post('/media/upload', { preHandler: [requireRole(app, 'admin')] }, async (request, reply) => {
    // Note: file upload requires @fastify/multipart — add later
    return reply.code(501).send({ status: 'error', message: 'File upload not yet implemented', data: null })
  })

  app.get('/media/presign/*', async (request, reply) => {
    const { '*': key } = request.params as { '*': string }
    if (!key) {
      return reply.code(400).send({ status: 'error', message: 'Missing key', data: null })
    }
    try {
      const url = await app.s3PresignGet(key)
      return reply.send({ status: 'success', message: 'OK', data: { url } })
    } catch {
      return reply.code(503).send({ status: 'error', message: 'S3 not available', data: null })
    }
  })
}
