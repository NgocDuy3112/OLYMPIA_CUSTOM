import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db } from "@oc/db";
import { requireRole } from "../auth/auth.service.js";
import { applyTemplate, generateNextRound } from "./template.service.js";
import { BUILTIN_TEMPLATES, getBuiltinTemplate } from "./templates.json.js";

export async function templateRoutes(app: FastifyInstance) {
  // GET /templates — List builtin templates (JSON, no DB)
  app.get("/templates", async (_request, reply) => {
    return reply.send({ status: "success", message: "OK", data: BUILTIN_TEMPLATES });
  });

  // GET /templates/:id — Get builtin template by ID
  app.get("/templates/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = getBuiltinTemplate(id);

    if (!template) {
      return reply
        .code(404)
        .send({ status: "error", message: "Template not found", data: null });
    }

    return reply.send({ status: "success", message: "OK", data: template });
  });

  // POST /tournaments/:code/apply-template — Apply template to tournament
  app.post(
    "/tournaments/:code/apply-template",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = request.body as { templateId: string };

      if (!body.templateId) {
        return reply.code(400).send({
          status: "error",
          message: "templateId is required",
          data: null,
        });
      }

      const session = (request as any).session;

      // Get builtin template
      const template = getBuiltinTemplate(body.templateId);

      if (!template) {
        return reply.code(404).send({
          status: "error",
          message: "Template not found",
          data: null,
        });
      }

      // Get tournament
      const { tournaments } = await import("@oc/db");
      const tournament = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(
          and(
            eq(tournaments.tournamentCode, code),
            eq(tournaments.isDeleted, false),
          ),
        )
        .limit(1);

      if (tournament.length === 0) {
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }

      // Apply template - generate matches
      const result = await applyTemplate(
        code,
        template.config as any,
        session.userId,
      );

      // Update tournament format
      await db
        .update(tournaments)
        .set({
          tournamentFormat: template.templateType,
          updatedAt: new Date(),
        })
        .where(eq(tournaments.id, tournament[0].id));

      return reply.send({
        status: "success",
        message: "Template applied",
        data: {
          config: template.config,
          phases: result.phases,
          totalMatches: result.totalMatches,
        },
      });
    },
  );

  // POST /tournaments/:code/generate-next-round — Generate next round from current results
  app.post(
    "/tournaments/:code/generate-next-round",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = request.body as { currentPhase: number };

      if (!body.currentPhase) {
        return reply.code(400).send({
          status: "error",
          message: "currentPhase is required",
          data: null,
        });
      }

      try {
        const result = await generateNextRound(code, body.currentPhase);
        return reply.send({
          status: "success",
          message: "Next round generated",
          data: result,
        });
      } catch (err) {
        return reply.code(400).send({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to generate next round",
          data: null,
        });
      }
    },
  );
}
