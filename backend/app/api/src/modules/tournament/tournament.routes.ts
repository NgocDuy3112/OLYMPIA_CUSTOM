import type { FastifyInstance } from 'fastify'
import { eq, and, desc } from 'drizzle-orm'
import { db, tournaments, tournamentPlayers, users } from '@oc/db'
import { requireRole } from '../auth/auth.service.js'

export async function tournamentRoutes(app: FastifyInstance) {
  // GET /tournaments — List all tournaments
  app.get('/tournaments', async (_request, reply) => {
    const rows = await db.select().from(tournaments)
      .where(eq(tournaments.isDeleted, false))
      .orderBy(desc(tournaments.createdAt))
    return reply.send({ status: 'success', message: 'OK', data: rows })
  })

  // POST /tournaments — Create a new tournament
  app.post('/tournaments', { preHandler: [requireRole(app, 'admin')] }, async (request, reply) => {
    const body = request.body as {
      tournamentName: string
      description?: string
      tournamentFormat?: string
      startDate?: string
      endDate?: string
      maxPlayers?: string
      venue?: string
      notes?: string
    }

    if (!body.tournamentName) {
      return reply.code(400).send({ status: 'error', message: 'tournamentName is required', data: null })
    }

    const session = (request as any).session
    const tournamentCode = `OC3_T_${Date.now().toString(36).toUpperCase()}`

    const result = await db.insert(tournaments).values({
      tournamentCode,
      tournamentName: body.tournamentName,
      description: body.description,
      tournamentFormat: body.tournamentFormat || 'oc3',
      startDate: body.startDate,
      endDate: body.endDate,
      maxPlayers: body.maxPlayers,
      venue: body.venue,
      notes: body.notes,
      createdBy: session.userId,
    }).returning()

    return reply.code(201).send({
      status: 'success',
      message: 'Tournament created',
      data: result[0],
    })
  })

  // GET /tournaments/:code — Get tournament details
  app.get('/tournaments/:code', async (request, reply) => {
    const { code } = request.params as { code: string }
    const rows = await db.select().from(tournaments)
      .where(and(eq(tournaments.tournamentCode, code), eq(tournaments.isDeleted, false)))
      .limit(1)

    if (rows.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'Tournament not found', data: null })
    }

    // Get players in this tournament
    const players = await db.select({
      id: tournamentPlayers.id,
      groupNumber: tournamentPlayers.groupNumber,
      notes: tournamentPlayers.notes,
      userCode: users.userCode,
      userName: users.userName,
      userId: users.id,
      email: users.email,
    }).from(tournamentPlayers)
      .innerJoin(users, eq(tournamentPlayers.playerId, users.id))
      .where(eq(tournamentPlayers.tournamentId, rows[0].id))

    return reply.send({ status: 'success', message: 'OK', data: { ...rows[0], players } })
  })

  // PUT /tournaments/:code — Update tournament
  app.put('/tournaments/:code', { preHandler: [requireRole(app, 'admin')] }, async (request, reply) => {
    const { code } = request.params as { code: string }
    const body = request.body as {
      tournamentName?: string
      description?: string
      tournamentFormat?: string
      startDate?: string
      endDate?: string
      status?: string
      maxPlayers?: string
      venue?: string
      notes?: string
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.tournamentName) updates.tournamentName = body.tournamentName
    if (body.description !== undefined) updates.description = body.description
    if (body.tournamentFormat) updates.tournamentFormat = body.tournamentFormat
    if (body.startDate !== undefined) updates.startDate = body.startDate
    if (body.endDate !== undefined) updates.endDate = body.endDate
    if (body.status) updates.status = body.status
    if (body.maxPlayers !== undefined) updates.maxPlayers = body.maxPlayers
    if (body.venue !== undefined) updates.venue = body.venue
    if (body.notes !== undefined) updates.notes = body.notes

    const result = await db.update(tournaments).set(updates)
      .where(and(eq(tournaments.tournamentCode, code), eq(tournaments.isDeleted, false)))
      .returning({ id: tournaments.id })

    if (result.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'Tournament not found', data: null })
    }

    return reply.send({ status: 'success', message: 'Tournament updated', data: null })
  })

  // DELETE /tournaments/:code — Soft delete tournament
  app.delete('/tournaments/:code', { preHandler: [requireRole(app, 'admin')] }, async (request, reply) => {
    const { code } = request.params as { code: string }
    const result = await db.update(tournaments).set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(tournaments.tournamentCode, code), eq(tournaments.isDeleted, false)))
      .returning({ id: tournaments.id })

    if (result.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'Tournament not found', data: null })
    }

    return reply.send({ status: 'success', message: 'Tournament deleted', data: null })
  })

  // POST /tournaments/:code/players — Add player to tournament
  app.post('/tournaments/:code/players', { preHandler: [requireRole(app, 'admin')] }, async (request, reply) => {
    const { code } = request.params as { code: string }
    const body = request.body as { userCode: string; groupNumber?: string; notes?: string }

    if (!body.userCode) {
      return reply.code(400).send({ status: 'error', message: 'userCode is required', data: null })
    }

    // Find tournament
    const tournamentRows = await db.select({ id: tournaments.id }).from(tournaments)
      .where(and(eq(tournaments.tournamentCode, code), eq(tournaments.isDeleted, false)))
      .limit(1)

    if (tournamentRows.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'Tournament not found', data: null })
    }

    // Find user
    const userRows = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.userCode, body.userCode), eq(users.isDeleted, false)))
      .limit(1)

    if (userRows.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'User not found', data: null })
    }

    // Check if already added
    const existing = await db.select().from(tournamentPlayers)
      .where(and(
        eq(tournamentPlayers.tournamentId, tournamentRows[0].id),
        eq(tournamentPlayers.playerId, userRows[0].id)
      ))
      .limit(1)

    if (existing.length > 0) {
      return reply.code(409).send({ status: 'error', message: 'Player already in tournament', data: null })
    }

    // Add player
    await db.insert(tournamentPlayers).values({
      tournamentId: tournamentRows[0].id,
      playerId: userRows[0].id,
      groupNumber: body.groupNumber,
      notes: body.notes,
    })

    return reply.code(201).send({ status: 'success', message: 'Player added to tournament', data: null })
  })

  // DELETE /tournaments/:code/players/:userCode — Remove player from tournament
  app.delete('/tournaments/:code/players/:userCode', { preHandler: [requireRole(app, 'admin')] }, async (request, reply) => {
    const { code, userCode } = request.params as { code: string; userCode: string }

    // Find tournament
    const tournamentRows = await db.select({ id: tournaments.id }).from(tournaments)
      .where(and(eq(tournaments.tournamentCode, code), eq(tournaments.isDeleted, false)))
      .limit(1)

    if (tournamentRows.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'Tournament not found', data: null })
    }

    // Find user
    const userRows = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
      .limit(1)

    if (userRows.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'User not found', data: null })
    }

    // Delete player from tournament
    await db.delete(tournamentPlayers)
      .where(and(
        eq(tournamentPlayers.tournamentId, tournamentRows[0].id),
        eq(tournamentPlayers.playerId, userRows[0].id)
      ))

    return reply.send({ status: 'success', message: 'Player removed from tournament', data: null })
  })
}
