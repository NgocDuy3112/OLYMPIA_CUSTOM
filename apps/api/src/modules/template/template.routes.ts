import type { FastifyInstance } from "fastify";
import { requireRole } from "../auth/auth.service.js";
import { applyTemplate, generateNextRound } from "./template.service.js";
import { BUILTIN_TEMPLATES, getBuiltinTemplate } from "./templates.json.js";
import { drizzleTemplateRepo } from "./template.repo.js";

export async function templateRoutes(app: FastifyInstance) {
  app.get("/templates", async (_request, reply) => {
    return reply.send({ status: "success", message: "OK", data: BUILTIN_TEMPLATES });
  });

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

      const template = getBuiltinTemplate(body.templateId);

      if (!template) {
        return reply.code(404).send({
          status: "error",
          message: "Template not found",
          data: null,
        });
      }

      const tournament = await drizzleTemplateRepo.findTournamentByCode(code);

      if (!tournament) {
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }

      const result = await applyTemplate(
        code,
        template.config as any,
        session.userId,
        { repo: drizzleTemplateRepo },
      );

      await drizzleTemplateRepo.updateTournamentFormat(
        tournament.id,
        template.templateType,
      );

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
