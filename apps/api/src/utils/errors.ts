import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  request.log.error({ err: error }, error.message)

  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      status: 'error',
      message: error.message,
      data: error.details ?? null,
    })
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return reply.code(error.statusCode).send({
      status: 'error',
      message: error.message,
      data: null,
    })
  }

  return reply.code(500).send({
    status: 'error',
    message: 'Internal server error',
    data: null,
  })
}
