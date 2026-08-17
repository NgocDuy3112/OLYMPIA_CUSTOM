import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { db, answers } from '@oc/db'
import { resolveBuzzIds } from '../../state/id-cache.js'

export async function answerRoutes(app: FastifyInstance) {
  // GET /answers/:matchCode — list answers for a match
  app.get('/answers/:matchCode', async (request, reply) => {
    const { matchCode } = request.params as { matchCode: string }
    const matchId = await resolveBuzzIds(app.valkey, matchCode, '', '')
      .then((r) => r.matchId)

    if (!matchId) {
      return reply.code(404).send({ status: 'error', message: 'Match not found', data: null })
    }

    const rows = await db.select().from(answers)
      .where(and(eq(answers.matchId, matchId), eq(answers.isDeleted, false)))

    return reply.send({ status: 'success', message: 'OK', data: rows })
  })
}
