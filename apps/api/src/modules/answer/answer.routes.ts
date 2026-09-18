import type { FastifyInstance } from "fastify";
import { resolveBuzzIds } from "../../state/id-cache.js";
import { drizzleAnswerRepo, type AnswerRepo } from "./answer.repo.js";

export async function answerRoutes(
  app: FastifyInstance,
  opts: { repo?: AnswerRepo } = {},
) {
  const repo = opts.repo ?? drizzleAnswerRepo;
  app.post("/answers/", async (request, reply) => {
    const body = request.body as {
      user_code: string;
      match_code: string;
      question_code: string;
      answer_text?: string;
      has_buzzed?: boolean;
      timestamp?: number;
    };
    const ids = await resolveBuzzIds(
      app.valkey,
      body.match_code,
      body.user_code,
      body.question_code,
    );
    if (!ids.matchId || !ids.playerId || !ids.questionId)
      return reply
        .code(404)
        .send({
          status: "error",
          message: "Match, player, or question not found",
        });
    const existing = await repo.findExisting(
      ids.matchId,
      ids.playerId,
      ids.questionId,
    );
    if (existing)
      return reply
        .code(409)
        .send({
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
  });

  // GET /answers/:matchCode — list answers for a match
  app.get("/answers/:matchCode", async (request, reply) => {
    const { matchCode } = request.params as { matchCode: string };
    const matchId = await resolveBuzzIds(app.valkey, matchCode, "", "").then(
      (r) => r.matchId,
    );

    if (!matchId) {
      return reply
        .code(404)
        .send({ status: "error", message: "Match not found", data: null });
    }

    const rows = await repo.listByMatch(matchId);

    return reply.send({ status: "success", message: "OK", data: rows });
  });
}
