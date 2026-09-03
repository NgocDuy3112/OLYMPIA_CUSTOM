import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db, tournamentTemplates } from "@oc/db";
import { requireRole } from "../auth/auth.service.js";
import { applyTemplate, generateNextRound } from "./template.service.js";

export async function templateRoutes(app: FastifyInstance) {
  // GET /templates — List all templates
  app.get("/templates", async (_request, reply) => {
    const rows = await db
      .select()
      .from(tournamentTemplates)
      .orderBy(desc(tournamentTemplates.isSystem), desc(tournamentTemplates.createdAt));
    return reply.send({ status: "success", message: "OK", data: rows });
  });

  // GET /templates/:id — Get template by ID
  app.get("/templates/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await db
      .select()
      .from(tournamentTemplates)
      .where(eq(tournamentTemplates.id, id))
      .limit(1);

    if (rows.length === 0) {
      return reply
        .code(404)
        .send({ status: "error", message: "Template not found", data: null });
    }

    return reply.send({ status: "success", message: "OK", data: rows[0] });
  });

  // POST /templates — Create custom template
  app.post(
    "/templates",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const body = request.body as {
        templateName: string;
        templateType: string;
        description?: string;
        config: Record<string, unknown>;
      };

      if (!body.templateName || !body.templateType || !body.config) {
        return reply.code(400).send({
          status: "error",
          message: "templateName, templateType, and config are required",
          data: null,
        });
      }

      const session = (request as any).session;

      const result = await db
        .insert(tournamentTemplates)
        .values({
          templateName: body.templateName,
          templateType: body.templateType,
          description: body.description,
          config: body.config,
          isSystem: false,
          createdBy: session.userId,
        })
        .returning();

      return reply.code(201).send({
        status: "success",
        message: "Template created",
        data: result[0],
      });
    },
  );

  // PUT /templates/:id — Update custom template
  app.put(
    "/templates/:id",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        templateName?: string;
        description?: string;
        config?: Record<string, unknown>;
      };

      // Check if system template
      const existing = await db
        .select({ isSystem: tournamentTemplates.isSystem })
        .from(tournamentTemplates)
        .where(eq(tournamentTemplates.id, id))
        .limit(1);

      if (existing.length === 0) {
        return reply.code(404).send({
          status: "error",
          message: "Template not found",
          data: null,
        });
      }

      if (existing[0].isSystem) {
        return reply.code(403).send({
          status: "error",
          message: "Cannot modify system template",
          data: null,
        });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.templateName) updates.templateName = body.templateName;
      if (body.description !== undefined) updates.description = body.description;
      if (body.config) updates.config = body.config;

      await db
        .update(tournamentTemplates)
        .set(updates)
        .where(eq(tournamentTemplates.id, id));

      return reply.send({
        status: "success",
        message: "Template updated",
        data: null,
      });
    },
  );

  // DELETE /templates/:id — Delete custom template
  app.delete(
    "/templates/:id",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await db
        .select({ isSystem: tournamentTemplates.isSystem })
        .from(tournamentTemplates)
        .where(eq(tournamentTemplates.id, id))
        .limit(1);

      if (existing.length === 0) {
        return reply.code(404).send({
          status: "error",
          message: "Template not found",
          data: null,
        });
      }

      if (existing[0].isSystem) {
        return reply.code(403).send({
          status: "error",
          message: "Cannot delete system template",
          data: null,
        });
      }

      await db.delete(tournamentTemplates).where(eq(tournamentTemplates.id, id));

      return reply.send({
        status: "success",
        message: "Template deleted",
        data: null,
      });
    },
  );

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

      // Get template
      const template = await db
        .select()
        .from(tournamentTemplates)
        .where(eq(tournamentTemplates.id, body.templateId))
        .limit(1);

      if (template.length === 0) {
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
        template[0].config as any,
        session.userId,
      );

      // Update tournament format
      await db
        .update(tournaments)
        .set({
          tournamentFormat: template[0].templateType,
          updatedAt: new Date(),
        })
        .where(eq(tournaments.id, tournament[0].id));

      return reply.send({
        status: "success",
        message: "Template applied",
        data: {
          config: template[0].config,
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
