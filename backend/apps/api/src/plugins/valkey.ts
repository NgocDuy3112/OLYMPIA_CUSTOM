import type { FastifyInstance } from 'fastify'
import Redis from 'ioredis'
import { getEnv } from '../config/env.js'
import fp from 'fastify-plugin'

// Extend FastifyInstance to carry valkey
declare module 'fastify' {
  interface FastifyInstance {
    valkey: Redis
    valkeySub: Redis
  }
}

async function valkeyPlugin(app: FastifyInstance) {
  const env = getEnv()

  const makeClient = () => {
    const client = new Redis({
      host: env.VALKEY_HOST,
      port: env.VALKEY_PORT,
      password: env.VALKEY_PASSWORD || undefined,
      username: env.VALKEY_USER || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy(times) {
        if (times > 10) return null
        return Math.min(times * 200, 5000)
      },
    })
    return client
  }

  const valkey = makeClient()
  const valkeySub = makeClient()

  valkey.on('connect', () => app.log.info('Valkey connected'))
  valkey.on('error', (err) => app.log.error({ err }, 'Valkey error'))
  valkeySub.on('error', (err) => app.log.error({ err }, 'Valkey subscriber error'))

  await Promise.race([
    new Promise<void>((resolve) => valkey.once('ready', resolve)),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Valkey connection timeout')), 5000),
    ),
  ])

  app.decorate('valkey', valkey)
  app.decorate('valkeySub', valkeySub)

  app.addHook('onClose', async () => {
    valkeySub.disconnect()
    valkey.disconnect()
  })
}

export default fp(valkeyPlugin, { name: 'valkey' })
