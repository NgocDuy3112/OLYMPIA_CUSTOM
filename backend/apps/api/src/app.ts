/**
 * createApp — assembles all Fastify plugins and routes.
 */

import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { ZodTypeProvider } from '@fastify/type-provider-zod'
import { registerCors } from './plugins/cors.js'
import { registerWebSocket } from './plugins/websocket.js'
import valkeyPlugin from './plugins/valkey.js'
import s3Plugin from './plugins/s3.js'
import { errorHandler } from './utils/errors.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { userRoutes } from './modules/user/user.routes.js'
import { matchRoutes } from './modules/match/match.routes.js'
import { questionRoutes } from './modules/question/question.routes.js'
import { answerRoutes } from './modules/answer/answer.routes.js'
import { recordRoutes } from './modules/record/record.routes.js'
import { scoreboardRoutes } from './modules/scoreboard/scoreboard.routes.js'
import { mediaRoutes } from './modules/media/media.routes.js'
import { tournamentRoutes } from './modules/tournament/tournament.routes.js'
import { wsRoute } from './modules/ws/ws.route.js'

export async function createApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  })

  // Type provider
  app.withTypeProvider<ZodTypeProvider>()

  // Plugins
  await app.register(cookie)
  await registerCors(app)
  await registerWebSocket(app)
  await app.register(valkeyPlugin)
  await app.register(s3Plugin)

  // Error handler
  app.setErrorHandler(errorHandler)

  // Health check
  app.get('/health', async () => ({ status: 'healthy' }))

  // API routes
  await app.register(authRoutes, { prefix: '/api' })
  await app.register(userRoutes, { prefix: '/api' })
  await app.register(matchRoutes, { prefix: '/api' })
  await app.register(questionRoutes, { prefix: '/api' })
  await app.register(answerRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(scoreboardRoutes, { prefix: '/api' })
  await app.register(mediaRoutes, { prefix: '/api' })
await app.register(tournamentRoutes, { prefix: '/api' })

  // WebSocket route
  await app.register(wsRoute)

  return app
}
