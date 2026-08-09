import type { FastifyInstance } from 'fastify'
import { googleRedirect, googleCallback, getMe, logout } from './auth.service.js'

export async function authRoutes(app: FastifyInstance) {
  app.get('/auth/google', googleRedirect)
  app.get('/auth/google/callback', googleCallback(app))
  app.get('/auth/me', getMe(app))
  app.post('/auth/logout', logout(app))
}
