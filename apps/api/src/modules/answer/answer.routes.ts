import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/auth.service.js";
import { resolveBuzzIds, resolveMatchId } from "../../state/id-cache.js";
import { drizzleAnswerRepo, type AnswerRepo } from "./answer.repo.js";

export async function answerRoutes(
  app: FastifyInstance,
  opts: { repo?: AnswerRepo } = {},
) {
  const repo = opts.repo ?? drizzleAnswerRepo;
  // POST /answers/ — player submits own answer. Requires auth; playerCode
  // comes from session (prevents spoofing user_code of another player).
  // Controller/admin may submit on behalf by passing explicit user_code.
  app.post(
    "/answers/",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const body = request.body as {
        user_code?: string;
        match_code: string;
        question_code: string;
        answer_text?: string;
        has_buzzed?: boolean;
        timestamp?: number;
      };
      const session = (
        request as unknown as {
          session: {
            userId: string;
            userCode: string;
            role: string;
            operatorScopes?: string | null;
          };
        }
      ).session;
      const scopes = (session.operatorScopes ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const isStaff =
        session.role === "admin" ||
        (session.role === "operator" &&
          (scopes.includes("controller") ||
            scopes.includes("question_creator")));
      // Non-staff must submit as themselves; ignore spoofed user_code.
      const effectiveUserCode =
        isStaff && body.user_code ? body.user_code : session.userCode;
      if (!body.match_code || !body.question_code || !effectiveUserCode) {
        return reply.code(400).send({
          status: "error",
          message: "match_code, question_code required",
        });
      }
      const ids = await resolveBuzzIds(
        app.valkey,
        body.match_code,
        effectiveUserCode,
        body.question_code,
      );
      if (!ids.matchId || !ids.playerId || !ids.questionId)
        return reply.code(404).send({
          status: "error",
          message: "Match, player, or question not found",
        });
      const existing = await repo.findExisting(
        ids.matchId,
        ids.playerId,
        ids.questionId,
      );
      if (existing)
        return reply.code(409).send({
          status: "error",
          message: "Player already answered this question",
        });
      const row = await repo.create({
        matchId: ids.matchId,
        playerId: ids.playerId,
        questionId: ids.questionId,
        answerText: body.answer_text ?? null,
        hasBuzzed: body.has_buzzed ?? false,
        timestamp: body.timestamp ?? null,
      });
      return reply
        .code(201)
        .send({ status: "success", message: "Answer submitted", data: row });
    },
  );

  // GET /answers/:matchCode — list answers for a match. Requires auth.
  // Staff (admin/controller/question_creator) see all; players see own only.
  app.get(
    "/answers/:matchCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode } = request.params as { matchCode: string };
      const matchId = await resolveMatchId(app.valkey, matchCode);
      if (!matchId) {
        return reply
          .code(404)
          .send({ status: "error", message: "Match not found", data: null });
      }
      const session = (
        request as unknown as {
          session: {
            userId: string;
            userCode: string;
            role: string;
            operatorScopes?: string | null;
          };
        }
      ).session;
      const rows = await repo.listByMatch(matchId);
      const scopes = (session.operatorScopes ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const isStaff =
        session.role === "admin" ||
        (session.role === "operator" &&
          (scopes.includes("controller") ||
            scopes.includes("question_creator") ||
            scopes.includes("mc")));
      if (isStaff) {
        return reply.send({ status: "success", message: "OK", data: rows });
      }
      // Player/spectator: only own answers (match playerId to session userId).
      const mine = rows.filter(
        (r: { playerId?: string }) => r.playerId === session.userId,
      );
      return reply.send({ status: "success", message: "OK", data: mine });
    },
  );

  // GET /answers/:matchCode/:questionCode — answers for one question.
  // Staff only (admin/controller/question_creator/mc). Used by controller
  // "HIỆN TRẢ LỜI" to broadcast answers over WS.
  app.get(
    "/answers/:matchCode/:questionCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode, questionCode } = request.params as {
        matchCode: string;
        questionCode: string;
      };
      const session = (
        request as unknown as {
          session: {
            userId: string;
            role: string;
            operatorScopes?: string | null;
          };
        }
      ).session;
      const scopes = (session.operatorScopes ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const isStaff =
        session.role === "admin" ||
        (session.role === "operator" &&
          (scopes.includes("controller") ||
            scopes.includes("question_creator") ||
            scopes.includes("mc")));
      if (!isStaff) {
        return reply.code(403).send({
          status: "error",
          message: "Staff only",
          data: null,
        });
      }
      const ids = await resolveBuzzIds(
        app.valkey,
        matchCode,
        "",
        questionCode,
      );
      if (!ids.matchId || !ids.questionId) {
        return reply.code(404).send({
          status: "error",
          message: "Match or question not found",
          data: null,
        });
      }
      const rows = await repo.listByQuestion(ids.matchId, ids.questionId);
      return reply.send({ status: "success", message: "OK", data: rows });
    },
  );
}
