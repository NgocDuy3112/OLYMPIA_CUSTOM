import { AppError } from "../../utils/errors.js";
import type { FastifyInstance } from "fastify";
import { requireRole, reqSession } from "../auth/auth.service.js";
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
      throw new AppError(404, "Template not found");
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
        throw new AppError(400, "templateId is required");
      }

      const session = reqSession(request);

      const template = getBuiltinTemplate(body.templateId);

      if (!template) {
        throw new AppError(404, "Template not found");
      }

      const tournament = await drizzleTemplateRepo.findTournamentByCode(code);

      if (!tournament) {
        throw new AppError(404, "Tournament not found");
      }

      const result = await applyTemplate(
        code,
        template.config,
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
        throw new AppError(400, "currentPhase is required");
      }

      try {
        const result = await generateNextRound(code, body.currentPhase);
        return reply.send({
          status: "success",
          message: "Next round generated",
          data: result,
        });
      } catch (err) {
        throw new AppError(400, err instanceof Error ? err.message : "Failed to generate next round");
      }
    },
  );
}
