import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { db, users } from '@olympia/db'
import { requireRole } from '../auth/auth.service.js'

export async function userRoutes(app: FastifyInstance) {
  app.get('/users', { preHandler: [requireRole(app, 'admin')] }, async (_request, reply) => {
    const rows = await db.select({
      id: users.id,
      userCode: users.userCode,
      userName: users.userName,
      email: users.email,
      role: users.role,
      avatarUrl: users.avatarUrl,
      isDeleted: users.isDeleted,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.isDeleted, false))
    return reply.send({ status: 'success', message: 'OK', data: rows })
  })

  app.get('/users/:userCode', { preHandler: [requireRole(app, 'admin')] }, async (request, reply) => {
    const { userCode } = request.params as { userCode: string }
    const rows = await db.select({
      id: users.id,
      userCode: users.userCode,
      userName: users.userName,
      email: users.email,
      role: users.role,
      avatarUrl: users.avatarUrl,
    }).from(users).where(and(eq(users.userCode, userCode), eq(users.isDeleted, false))).limit(1)
    if (rows.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'User not found', data: null })
    }
    return reply.send({ status: 'success', message: 'OK', data: rows[0] })
  })

  app.put('/users/:userCode', { preHandler: [requireRole(app, 'admin')] }, async (request, reply) => {
    const { userCode } = request.params as { userCode: string }
    const body = request.body as { userName?: string; role?: string }
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (body.userName) updates.userName = body.userName
    if (body.role) updates.role = body.role
    const result = await db.update(users).set(updates)
      .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
      .returning({ id: users.id })
    if (result.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'User not found', data: null })
    }
    return reply.send({ status: 'success', message: 'User updated', data: { id: result[0].id } })
  })

  app.delete('/users/:userCode', { preHandler: [requireRole(app, 'admin')] }, async (request, reply) => {
    const { userCode } = request.params as { userCode: string }
    const result = await db.update(users).set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
      .returning({ id: users.id })
    if (result.length === 0) {
      return reply.code(404).send({ status: 'error', message: 'User not found', data: null })
    }
    return reply.send({ status: 'success', message: 'User deleted', data: null })
  })
}
