import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../auth/auth.service.js";

export async function mediaRoutes(app: FastifyInstance) {
  app.post(
    "/media/upload",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      // Note: file upload requires @fastify/multipart — add later
      return reply
        .code(501)
        .send({
          status: "error",
          message: "File upload not yet implemented",
          data: null,
        });
    },
  );

  app.get("/media/presign/*", async (request, reply) => {
    const { "*": key } = request.params as { "*": string };
    if (!key) {
      return reply
        .code(400)
        .send({ status: "error", message: "Missing key", data: null });
    }
    try {
      const url = await app.s3PresignGet(key);
      return reply.send({ status: "success", message: "OK", data: { url } });
    } catch {
      return reply
        .code(503)
        .send({ status: "error", message: "S3 not available", data: null });
    }
  });

  // GET /media/presign-put/?key=...&contentType=... — presigned PUT for avatar upload
  app.get(
    "/media/presign-put/",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { key, contentType } = request.query as {
        key?: string;
        contentType?: string;
      };
      if (!key || !key.startsWith("avatars/")) {
        return reply.code(400).send({
          status: "error",
          message: "Key must start with avatars/",
          data: null,
        });
      }
      if (contentType && !contentType.startsWith("image/")) {
        return reply.code(400).send({
          status: "error",
          message: "Only image content types allowed",
          data: null,
        });
      }
      try {
        const url = await app.s3PresignPut(key, contentType);
        return reply.send({ status: "success", message: "OK", data: { url } });
      } catch {
        return reply
          .code(503)
          .send({ status: "error", message: "S3 not available", data: null });
      }
    },
  );

  // GET /media/presign-question/?key=...&contentType=... — presigned PUT cho
  // QAuthor upload media câu hỏi (ảnh/audio/video). Flow: Excel trước (text),
  // câu nào cần media thì upload file rồi PATCH mediaUrl vào bank/question sau.
  // Key bắt buộc questions/<bankCode|questionCode>/<filename>.
  app.get(
    "/media/presign-question/",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = (
        request as unknown as {
          session: { role: string; operatorScopes?: string | null };
        }
      ).session;
      const scopes = (session.operatorScopes ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const allowed =
        session.role === "admin" ||
        (session.role === "operator" && scopes.includes("qauthor"));
      if (!allowed) {
        return reply.code(403).send({
          status: "error",
          message: "Only admin or qauthor can upload question media",
          data: null,
        });
      }
      const { key, contentType } = request.query as {
        key?: string;
        contentType?: string;
      };
      if (!key || !key.startsWith("questions/")) {
        return reply.code(400).send({
          status: "error",
          message: "Key must start with questions/",
          data: null,
        });
      }
      if (contentType) {
        const ok =
          contentType.startsWith("image/") ||
          contentType.startsWith("audio/") ||
          contentType.startsWith("video/");
        if (!ok) {
          return reply.code(400).send({
            status: "error",
            message: "Only image/audio/video content types allowed",
            data: null,
          });
        }
      }
      try {
        const url = await app.s3PresignPut(key, contentType);
        return reply.send({ status: "success", message: "OK", data: { url, key } });
      } catch {
        return reply
          .code(503)
          .send({ status: "error", message: "S3 not available", data: null });
      }
    },
  );
}
