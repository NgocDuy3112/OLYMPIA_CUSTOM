import type { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  records,
  users,
  questions,
  matchPlayerPositions,
  matches,
} from "@oc/db";
import {
  kdcCorrect,
  kdrCorrect,
  kdrWrong,
  gmClueCorrect,
  gmKeywordCorrect,
  vdrScore,
  vdcResolve,
  bpResolve,
} from "@oc/engine";
import { resolveMatchId, resolveUserId } from "../../state/id-cache.js";
import { requireScope } from "../auth/auth.service.js";
import { AppError } from "../../utils/errors.js";
import { writeAudit } from "../audit/audit.service.js";

export async function scoreboardRoutes(app: FastifyInstance) {
  // GET /scoreboard/:matchCode — get scoreboard for a match
  app.get("/scoreboard/:matchCode", async (request, reply) => {
    const { matchCode } = request.params as { matchCode: string };
    const matchId = await resolveMatchId(app.valkey, matchCode);
    if (!matchId) {
      return reply
        .code(404)
        .send({ status: "error", message: "Match not found", data: null });
    }

    // Get players with positions
    const playerRows = await db
      .select({
        userCode: users.userCode,
        userName: users.userName,
        position: matchPlayerPositions.position,
      })
      .from(matchPlayerPositions)
      .innerJoin(users, eq(matchPlayerPositions.playerId, users.id))
      .where(eq(matchPlayerPositions.matchId, matchId))
      .orderBy(matchPlayerPositions.position);

    // Get scores
    const scoreRows = await db
      .select({
        userCode: users.userCode,
        totalPoints: sql<number>`COALESCE(SUM(${records.points}), 0)`.as(
          "total_points",
        ),
      })
      .from(records)
      .innerJoin(users, eq(records.playerId, users.id))
      .where(and(eq(records.matchId, matchId), eq(records.isDeleted, false)))
      .groupBy(users.userCode);

    const scoreMap = new Map(
      scoreRows.map((r) => [r.userCode, Number(r.totalPoints)]),
    );

    const scoreboard = playerRows.map((p) => ({
      userCode: p.userCode,
      userName: p.userName,
      position: p.position,
      score: scoreMap.get(p.userCode) ?? 0,
    }));

    // Sort by score descending
    scoreboard.sort((a, b) => b.score - a.score);

    return reply.send({
      status: "success",
      message: "OK",
      data: { scoreboard },
    });
  });

  // POST /scoreboard/calculate — controller only; referee reviews and proposes
  app.post(
    "/scoreboard/calculate",
    { preHandler: [requireScope(app, "controller")] },
    async (request, reply) => {
      const body = request.body as {
        match_code?: unknown;
        question_code?: unknown;
        action?: unknown;
        user_codes?: unknown;
      };
      const matchCode =
        typeof body.match_code === "string" ? body.match_code : "";
      const questionCode =
        typeof body.question_code === "string" ? body.question_code : "";
      const action = typeof body.action === "string" ? body.action : "";
      const userCodes = Array.isArray(body.user_codes)
        ? body.user_codes.filter((c): c is string => typeof c === "string")
        : [];
      if (!matchCode || !questionCode || !action || userCodes.length === 0) {
        throw new AppError(400, "match_code, question_code, action, user_codes required");
      }

      const matchId = await resolveMatchId(app.valkey, matchCode);
      if (!matchId) throw new AppError(404, "Match not found");

      const questionRows = await db
        .select({ id: questions.id })
        .from(questions)
        .where(
          and(
            eq(questions.matchId, matchId),
            eq(questions.questionCode, questionCode),
            eq(questions.isDeleted, false),
          ),
        )
        .limit(1);
      if (questionRows.length === 0)
        throw new AppError(404, "Question not found");
      const questionId = questionRows[0].id;

      // Resolve player ids
      const playerIds = new Map<string, string>();
      for (const code of [...new Set(userCodes)]) {
        const id = await resolveUserId(app.valkey, code);
        if (!id) throw new AppError(404, `Player not found: ${code}`);
        playerIds.set(code, id);
      }

      // Engine scoring per action
      type Delta = { userCode: string; points: number };
      let deltas: Delta[] = [];
      if (action === "kdc_correct") {
        deltas = userCodes.map((code) => kdcCorrect(code));
      } else if (action === "kdr_correct") {
        if (userCodes.length !== 1)
          throw new AppError(422, "kdr_correct requires one player");
        deltas = [kdrCorrect(userCodes[0], 1)];
      } else if (action === "kdr_wrong") {
        if (userCodes.length !== 1)
          throw new AppError(422, "kdr_wrong requires one player");
        deltas = [kdrWrong(userCodes[0])];
      } else if (action === "gm_clue_correct") {
        deltas = userCodes.map((code) => gmClueCorrect(code));
      } else if (action === "gm_keyword_correct") {
        deltas = userCodes.map((code) => gmKeywordCorrect(code, 0));
      } else if (action === "vdr_correct" || action === "vdr_wrong") {
        deltas = userCodes.map((code) =>
          vdrScore(code, questionCode, action === "vdr_correct"),
        );
      } else if (action === "vdc_resolve") {
        const positionRows = await db
          .select({ userCode: users.userCode })
          .from(matchPlayerPositions)
          .innerJoin(users, eq(matchPlayerPositions.playerId, users.id))
          .where(eq(matchPlayerPositions.matchId, matchId));
        const allCodes = positionRows.map((r) => r.userCode);
        deltas = vdcResolve(allCodes, userCodes, questionCode);
      } else if (action === "bp_resolve") {
        const buzzOrder = userCodes.map((code) => ({
          userCode: code,
          timestamp: 0,
        }));
        deltas = bpResolve(buzzOrder);
      } else {
        throw new AppError(422, "Unsupported score action");
      }

      const rows = deltas
        .filter((d) => d.points !== 0)
        .map((d) => ({
          points: d.points,
          playerId: playerIds.get(d.userCode)!,
          matchId,
          questionId,
          questionCode,
        }));
      if (rows.length > 0) await db.insert(records).values(rows);
      const session = (request as any).session as { userCode?: string } | undefined;
      void writeAudit({
        actionType: "SCORE_CHANGE",
        actorCode: session?.userCode ?? null,
        matchCode,
        targetCode: questionCode,
        details: `${action}: ${deltas.map((d) => `${d.userCode}=${d.points}`).join(",")}`,
      });

      return reply.send({
        status: "success",
        message: "OK",
        data: { deltas },
      });
    },
  );

  // PATCH /scoreboard/controller-adjust — controller only; referee reviews and proposes
  app.patch(
    "/scoreboard/controller-adjust",
    { preHandler: [requireScope(app, "controller")] },
    async (request, reply) => {
      const body = request.body as {
        match_code?: unknown;
        user_code?: unknown;
        new_score?: unknown;
        question_code?: unknown;
        points?: unknown;
        reason?: unknown;
      };
      const matchCode =
        typeof body.match_code === "string" ? body.match_code : "";
      const userCode =
        typeof body.user_code === "string" ? body.user_code : "";
      if (!matchCode || !userCode)
        throw new AppError(400, "match_code and user_code required");

      const matchId = await resolveMatchId(app.valkey, matchCode);
      const playerId = await resolveUserId(app.valkey, userCode);
      if (!matchId || !playerId)
        throw new AppError(404, "Match or player not found");

      // Per-question adjust
      if (typeof body.question_code === "string" && body.question_code) {
        if (typeof body.points !== "number" || body.points % 5 !== 0)
          throw new AppError(400, "points must be a multiple of 5");
        const questionRows = await db
          .select({ id: questions.id })
          .from(questions)
          .where(
            and(
              eq(questions.matchId, matchId),
              eq(questions.questionCode, body.question_code),
              eq(questions.isDeleted, false),
            ),
          )
          .limit(1);
        if (questionRows.length === 0)
          throw new AppError(404, "Question not found");
        await db.insert(records).values({
          points: body.points,
          playerId,
          matchId,
          questionId: questionRows[0].id,
          questionCode: body.question_code,
        });
      } else {
        // Total adjust: diff vs current total
        if (typeof body.new_score !== "number" || body.new_score % 5 !== 0)
          throw new AppError(400, "new_score must be a multiple of 5");
        const totalRows = await db
          .select({
            total: sql<number>`COALESCE(SUM(${records.points}), 0)`.as("total"),
          })
          .from(records)
          .where(
            and(
              eq(records.matchId, matchId),
              eq(records.playerId, playerId),
              eq(records.isDeleted, false),
            ),
          );
        const current = Number(totalRows[0]?.total ?? 0);
        const delta = body.new_score - current;
        if (delta !== 0) {
          // Ensure adjust question exists
          let adjustRows = await db
            .select({ id: questions.id })
            .from(questions)
            .where(
              and(
                eq(questions.matchId, matchId),
                eq(questions.questionCode, "OC3_Q_ADMIN_ADJUST"),
              ),
            )
            .limit(1);
          if (adjustRows.length === 0) {
            const inserted = await db
              .insert(questions)
              .values({
                matchId,
                questionCode: "OC3_Q_ADMIN_ADJUST",
                content: "(Controller score adjustment)",
                answer: "N/A",
              })
              .returning({ id: questions.id });
            adjustRows = inserted;
          }
          await db.insert(records).values({
            points: Math.round(delta / 5) * 5,
            playerId,
            matchId,
            questionId: adjustRows[0].id,
            questionCode: "OC3_Q_ADMIN_ADJUST",
          });
        }
      }

      return reply.send({
        status: "success",
        message: "Score adjusted",
        data: null,
      });
    },
  );
}
