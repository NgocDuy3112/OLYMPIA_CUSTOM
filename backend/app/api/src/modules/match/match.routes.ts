import type { FastifyInstance } from 'fastify'
import { eq, and, desc } from 'drizzle-orm'
import { db, matches, matchPlayerPositions, users } from '@oc/db'
import { requireRole } from '../auth/auth.service.js'

export async function matchRoutes(app: FastifyInstance) {
  app.get('/matches', async (_request, reply) => {
    const rows = await db.select().from(matches)
      .where(eq(matches.isDeleted, false))
      .orderBy(desc(matches.createdAt))
    return reply.send({ status: 'success', message: 'OK', data: rows })
  })

  app.post('/matches', { preHandler: [requireRole(app, 'admin')] }, async (request, reply) => {
    const body = request.body as { matchName: string }
    if (!body.matchName) {
      return reply.code(400).send({ status: 'error', message: 'matchName is required', data: null })
    }
    const session = (request as any).session
    const matchCode = `OC3_M_${Date.now().toString(36).toUpperCase()}`
    const result = await db.insert(matches).values({
      matchCode,
      matchName: body.matchName,
      createdBy: session.userId,
    }).returning()
    return reply.code(201).send({
      status: 'success',
      message: 'Match created',
      data: { matchCode: result[0].matchCode, matchName: result[0].matchName },
    })
  })

  app.get('/matches/:code', async (request, reply) => {
    const { code } = request.params as { code: string }
    const rows = await db.select().from(matches)
      .where(and(eq(matches.matchCode, code), eq(matches.isDeleted, false)))
      .limit(1)
    if (rows.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'Match not found', data: null })
    }
    const players = await db.select({
      position: matchPlayerPositions.position,
      userCode: users.userCode,
      userName: users.userName,
      userId: users.id,
    }).from(matchPlayerPositions)
      .innerJoin(users, eq(matchPlayerPositions.playerId, users.id))
      .where(eq(matchPlayerPositions.matchId, rows[0].id))
      .orderBy(matchPlayerPositions.position)
    return reply.send({ status: 'success', message: 'OK', data: { ...rows[0], players } })
  })

  app.put('/matches/:code', { preHandler: [requireRole(app, 'admin')] }, async (request, reply) => {
    const { code } = request.params as { code: string }
    const body = request.body as { matchName?: string; matchStatus?: string; videoUrl?: string; tournamentFormat?: string }
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.matchName) updates.matchName = body.matchName
    if (body.matchStatus) updates.matchStatus = body.matchStatus
    if (body.videoUrl !== undefined) updates.videoUrl = body.videoUrl
    if (body.tournamentFormat) updates.tournamentFormat = body.tournamentFormat
    const result = await db.update(matches).set(updates)
      .where(and(eq(matches.matchCode, code), eq(matches.isDeleted, false)))
      .returning({ id: matches.id })
    if (result.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'Match not found', data: null })
    }
    return reply.send({ status: 'success', message: 'Match updated', data: null })
  })

  app.post('/matches/:code/players', { preHandler: [requireRole(app, 'admin')] }, async (request, reply) => {
    const { code } = request.params as { code: string }
    const body = request.body as { userCode: string; position: number }
    const matchRows = await db.select({ id: matches.id }).from(matches)
      .where(and(eq(matches.matchCode, code), eq(matches.isDeleted, false))).limit(1)
    if (matchRows.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'Match not found', data: null })
    }
    const userRows = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.userCode, body.userCode), eq(users.isDeleted, false))).limit(1)
    if (userRows.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'User not found', data: null })
    }
    const existing = await db.select().from(matchPlayerPositions)
      .where(and(eq(matchPlayerPositions.matchId, matchRows[0].id), eq(matchPlayerPositions.playerId, userRows[0].id)))
      .limit(1)
    if (existing.length > 0) {
      await db.update(matchPlayerPositions).set({ position: body.position })
        .where(eq(matchPlayerPositions.id, existing[0].id))
    } else {
      await db.insert(matchPlayerPositions).values({
        matchId: matchRows[0].id,
        playerId: userRows[0].id,
        position: body.position,
      })
    }
    return reply.send({ status: 'success', message: 'Player added', data: null })
  })
}
