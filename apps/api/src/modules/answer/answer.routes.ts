import { AppError } from "../../utils/errors.js";
import type { FastifyInstance } from "fastify";
import { isOperatorLike, requireAuth, reqSession } from "../auth/auth.service.js";
import { resolveBuzzIds, resolveMatchId } from "../../state/id-cache.js";
import { drizzleAnswerRepo, type AnswerRepo } from "./answer.repo.js";

export async function answerRoutes(
  app: FastifyInstance,
  opts: { repo?: AnswerRepo } = {},
) {
  const repo = opts.repo ?? drizzleAnswerRepo;
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
      const session = reqSession(request);
      const scopes = (session.operatorScopes ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const isStaff =
        session.role === "admin" ||
        (isOperatorLike(session.role) &&
          (scopes.includes("controller") || scopes.includes("qauthor")));
      const effectiveUserCode =
        isStaff && body.user_code ? body.user_code : session.userCode;
      if (!body.match_code || !body.question_code || !effectiveUserCode) {
        throw new AppError(400, "match_code, question_code required");
      }
      const ids = await resolveBuzzIds(
        app.valkey,
        body.match_code,
        effectiveUserCode,
        body.question_code,
      );
      if (!ids.matchId || !ids.playerId || !ids.questionId)
        throw new AppError(404, "Match, player, or question not found");
      const existing = await repo.findExisting(
        ids.matchId,
        ids.playerId,
        ids.questionId,
      );
      if (existing)
        throw new AppError(409, "Player already answered this question");
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

  app.get(
    "/answers/:matchCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode } = request.params as { matchCode: string };
      const matchId = await resolveMatchId(app.valkey, matchCode);
      if (!matchId) {
        throw new AppError(404, "Match not found");
      }
      const session = reqSession(request);
      const rows = await repo.listByMatch(matchId);
      const scopes = (session.operatorScopes ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const isStaff =
        session.role === "admin" ||
        (isOperatorLike(session.role) &&
          (scopes.includes("controller") ||
            scopes.includes("qauthor") ||
            scopes.includes("mc")));
      if (isStaff) {
        return reply.send({ status: "success", message: "OK", data: rows });
      }
      const mine = rows.filter(
        (r: { playerId?: string }) => r.playerId === session.userId,
      );
      return reply.send({ status: "success", message: "OK", data: mine });
    },
  );

  app.get(
    "/answers/:matchCode/:questionCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode, questionCode } = request.params as {
        matchCode: string;
        questionCode: string;
      };
      const session = reqSession(request);
      const scopes = (session.operatorScopes ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const isStaff =
        session.role === "admin" ||
        (isOperatorLike(session.role) &&
          (scopes.includes("controller") ||
            scopes.includes("qauthor") ||
            scopes.includes("mc")));
      if (!isStaff) {
        throw new AppError(403, "Staff only");
      }
      const ids = await resolveBuzzIds(
        app.valkey,
        matchCode,
        "",
        questionCode,
      );
      if (!ids.matchId || !ids.questionId) {
        throw new AppError(404, "Match or question not found");
      }
      const rows = await repo.listByQuestion(ids.matchId, ids.questionId);
      return reply.send({ status: "success", message: "OK", data: rows });
    },
  );
}
