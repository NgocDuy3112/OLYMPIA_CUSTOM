import { AppError } from "../../utils/errors.js";
import type { FastifyInstance } from "fastify";
import { isOperatorLike, requireAuth, requireRole, reqSession } from "../auth/auth.service.js";

export async function mediaRoutes(app: FastifyInstance) {
  app.post(
    "/media/upload",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      throw new AppError(501, "File upload not yet implemented");
    },
  );

  app.get("/media/presign/*", async (request, reply) => {
    const { "*": key } = request.params as { "*": string };
    if (!key) {
      throw new AppError(400, "Missing key");
    }
    try {
      const url = await app.s3PresignGet(key);
      return reply.send({ status: "success", message: "OK", data: { url } });
    } catch {
      throw new AppError(503, "S3 not available");
    }
  });

  app.get(
    "/media/presign-put/",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { key, contentType } = request.query as {
        key?: string;
        contentType?: string;
      };
      if (!key || !key.startsWith("avatars/")) {
        throw new AppError(400, "Key must start with avatars/");
      }
      if (contentType && !contentType.startsWith("image/")) {
        throw new AppError(400, "Only image content types allowed");
      }
      try {
        const url = await app.s3PresignPut(key, contentType);
        return reply.send({ status: "success", message: "OK", data: { url } });
      } catch {
        throw new AppError(503, "S3 not available");
      }
    },
  );

  app.get(
    "/media/presign-question/",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = reqSession(request);
      const scopes = (session.operatorScopes ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const allowed =
        session.role === "admin" ||
        (isOperatorLike(session.role) && scopes.includes("qauthor"));
      if (!allowed) {
        throw new AppError(403, "Only admin or qauthor can upload question media");
      }
      const { key, contentType } = request.query as {
        key?: string;
        contentType?: string;
      };
      if (!key || !key.startsWith("questions/")) {
        throw new AppError(400, "Key must start with questions/");
      }
      if (contentType) {
        const ok =
          contentType.startsWith("image/") ||
          contentType.startsWith("audio/") ||
          contentType.startsWith("video/");
        if (!ok) {
          throw new AppError(400, "Only image/audio/video content types allowed");
        }
      }
      try {
        const url = await app.s3PresignPut(key, contentType);
        return reply.send({ status: "success", message: "OK", data: { url, key } });
      } catch {
        throw new AppError(503, "S3 not available");
      }
    },
  );
}
