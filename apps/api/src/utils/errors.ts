import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { getEnv } from "../config/env.js";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = (
    request as unknown as {
      session?: { userCode?: string; role?: string };
    }
  ).session;
  // Context để đọc log là biết ngay route nào + ai gọi, khỏi đoán.
  const ctx = {
    err: error,
    method: request.method,
    url: request.url,
    actor: session?.userCode ?? null,
    role: session?.role ?? null,
  };

  if (error instanceof AppError) {
    request.log.warn(ctx, error.message);
    return reply.code(error.statusCode).send({
      status: "error",
      message: error.message,
      data: error.details ?? null,
    });
  }

  if ("statusCode" in error && typeof error.statusCode === "number") {
    request.log.warn(ctx, error.message);
    return reply.code(error.statusCode).send({
      status: "error",
      message: error.message,
      data: null,
    });
  }

  request.log.error(ctx, error.message);
  // Dev: trả message thật để frontend/console thấy ngay nguyên nhân.
  // Production: giấu chi tiết, chỉ log server-side.
  const dev = getEnv().NODE_ENV !== "production";
  return reply.code(500).send({
    status: "error",
    message: dev ? error.message : "Internal server error",
    data: null,
  });
}
