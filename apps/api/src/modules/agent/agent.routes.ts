
import { AppError } from "../../utils/errors.js";
import type { FastifyInstance } from "fastify";
import { requireScope, reqSession } from "../auth/auth.service.js";
import { forwardAgentAsk, AgentRateLimitError } from "./agent.gateway.js";
import { writeAudit } from "../audit/audit.service.js";

export async function agentRoutes(app: FastifyInstance) {
  app.post(
    "/agent/ask",
    { preHandler: [requireScope(app, "qauthor", "controller")] },
    async (request, reply) => {
      const body = request.body as {
        match_code?: unknown;
        matchCode?: unknown;
        question?: unknown;
      };
      const matchCode =
        typeof body.match_code === "string"
          ? body.match_code
          : typeof body.matchCode === "string"
            ? body.matchCode
            : "";
      const question = typeof body.question === "string" ? body.question : "";
      if (!question.trim()) {
        throw new AppError(400, "question is required");
      }
      const effectiveMatch = matchCode.trim() || "BANK_REVIEW";
      const session = reqSession(request);
      const userCode = session?.userCode ?? "anonymous";
      const scopes = (session?.operatorScopes ?? "").split(",").map((s) => s.trim());
      const agentRole =
        session?.role === "admin"
          ? "admin"
          : scopes.includes("controller")
            ? "controller"
            : scopes.includes("mc")
              ? "mc"
              : scopes.includes("qauthor")
                ? "qauthor"
                : "operator";

      try {
        const result = await forwardAgentAsk(
          app.valkey,
          { userCode, role: agentRole },
          effectiveMatch,
          question.trim(),
        );
        void writeAudit({
          actionType: "AGENT_ASK",
          actorCode: userCode,
          matchCode: effectiveMatch,
          details: question.trim().slice(0, 200),
        });
        return reply.send({
          status: "success",
          message: "OK",
          data: result,
        });
      } catch (err) {
        if (err instanceof AgentRateLimitError) {
          throw new AppError(429, "Bạn hỏi quá nhanh, thử lại sau một phút.");
        }
        throw new AppError(502, err instanceof Error ? err.message : "Agent unavailable");
      }
    },
  );
}
