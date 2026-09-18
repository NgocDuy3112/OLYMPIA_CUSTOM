import type { FastifyInstance } from "fastify";
import { resolveMatchId } from "../../state/id-cache.js";
import { requireAuth, requireScope } from "../auth/auth.service.js";
import { getEnv } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { writeAudit } from "../audit/audit.service.js";
import { manager } from "../ws/ws.manager.js";
import {
  drizzleScoreReviewRepo,
  type CandidateInput,
  type ScoreReviewCandidate,
  type ScoreReviewRepo,
} from "./score-review.repo.js";
import { drizzleQuestionRepo } from "../question/question.repo.js";

const REVIEW_TTL_SECONDS = 10 * 60;

// Bot callback auth: discord-bot has no user session, so it presents a
// shared service token (BOT_SERVICE_TOKEN). Web users use cookie session
// with controller scope or admin role. Empty token = dev, allow bot through.
function hasBotToken(request: {
  headers: Record<string, string | string[] | undefined>;
}): boolean {
  const expected = getEnv().BOT_SERVICE_TOKEN;
  if (!expected) return true;
  const got = request.headers["x-bot-token"];
  return typeof got === "string" && got === expected;
}

function label(position: number | null, userName: string): string {
  return `[${position ?? "?"}] ${userName}`;
}

export async function scoreReviewRoutes(
  app: FastifyInstance,
  opts: { repo?: ScoreReviewRepo } = {},
) {
  const repo = opts.repo ?? drizzleScoreReviewRepo;
  const questionRepo = drizzleQuestionRepo;
  // POST /score-reviews — controller marks [position] name, bot pings qauthor.
  app.post(
    "/score-reviews",
    { preHandler: [requireScope(app, "controller")] },
    async (request, reply) => {
      const body = request.body as {
        match_code?: unknown;
        question_code?: unknown;
        candidates?: unknown;
      };
      const matchCode =
        typeof body.match_code === "string" ? body.match_code : "";
      const questionCode =
        typeof body.question_code === "string" ? body.question_code : "";
      const rawCandidates = Array.isArray(body.candidates)
        ? body.candidates
        : [];
      if (!matchCode || !questionCode || rawCandidates.length === 0) {
        throw new AppError(
          400,
          "match_code, question_code, candidates required",
        );
      }
      if (rawCandidates.length > 4) {
        throw new AppError(400, "At most 4 candidates per review");
      }
      const inputs: CandidateInput[] = rawCandidates.map((c) => {
        const obj = c as Record<string, unknown>;
        const userCode =
          typeof obj.userCode === "string"
            ? obj.userCode
            : typeof obj.user_code === "string"
              ? obj.user_code
              : "";
        const answerText =
          typeof obj.answerText === "string"
            ? obj.answerText
            : typeof obj.answer_text === "string"
              ? obj.answer_text
              : "";
        if (!userCode)
          throw new AppError(400, "Each candidate needs userCode");
        return { userCode, answerText };
      });

      const matchId = await resolveMatchId(app.valkey, matchCode);
      if (!matchId) throw new AppError(404, "Match not found");
      const question = await questionRepo.findByCode(matchId, questionCode);
      if (!question) throw new AppError(404, "Question not found");

      const candidates = await repo.buildCandidates(
        matchId,
        question.id,
        inputs,
      );
      const session = request as unknown as {
        session?: { userCode?: string };
      };
      const createdBy = session.session?.userCode;
      const expiresAt = new Date(Date.now() + REVIEW_TTL_SECONDS * 1000);
      const inserted = await repo.create({
        matchId,
        questionId: question.id,
        matchCode,
        questionCode,
        candidates,
        createdBy,
        expiresAt,
      });
      const reviewId = inserted.id;

      // Fire-and-forget Discord ping via Valkey — bot posts embed + buttons.
      try {
        await app.valkey.publish(
          "oc:live-events",
          JSON.stringify({
            type: "score_review_request",
            review_id: reviewId,
            match_code: matchCode,
            question_code: questionCode,
            question_content: question.content,
            question_answer: question.answer,
            candidates: candidates.map((c) => ({
              user_code: c.userCode,
              label: label(c.position, c.userName),
              answer_text: c.answerText,
            })),
            expires_at: expiresAt.toISOString(),
          }),
        );
      } catch {
        // Bot offline — review stays pending, controller can still decide on web.
      }

      void writeAudit({
        actionType: "SCORE_CHANGE",
        actorCode: createdBy ?? null,
        matchCode,
        targetCode: questionCode,
        details: `score-review ${reviewId}: ${candidates.map((c) => label(c.position, c.userName)).join(", ")}`,
      });

      return reply.code(201).send({
        status: "success",
        message: "Review requested",
        data: { id: reviewId, expiresAt: expiresAt.toISOString() },
      });
    },
  );

  // GET /score-reviews/:id — controller/qauthor poll state. Requires auth.
  app.get(
    "/score-reviews/:id",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const review = await repo.findById(id);
      if (!review) {
        return reply
          .code(404)
          .send({ status: "error", message: "Review not found", data: null });
      }
      return reply.send({ status: "success", message: "OK", data: review });
    },
  );

  // GET /score-reviews?match_code=...&status=pending — list reviews for a
  // match. Requires auth. Used by qauthor reviews page + overview stats.
  app.get(
    "/score-reviews",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { match_code, matchCode, status } = request.query as {
        match_code?: string;
        matchCode?: string;
        status?: string;
      };
      const code = match_code ?? matchCode;
      if (!code) {
        return reply.code(400).send({
          status: "error",
          message: "match_code is required",
          data: null,
        });
      }
      const matchId = await resolveMatchId(app.valkey, code);
      if (!matchId) {
        return reply.code(404).send({
          status: "error",
          message: "Match not found",
          data: null,
        });
      }
      const rows = await repo.listByMatch(matchId, status);
      return reply.send({ status: "success", message: "OK", data: rows });
    },
  );

  // POST /score-reviews/:id/decision — qauthor verdict.
  // Two callers: (1) discord-bot with X-Bot-Token service secret,
  // (2) web controller with cookie session (controller scope/admin).
  // Body: { decisions: { [userCode]: "dung" | "sai" }, decidedBy, oceeSuggestion? }
  app.post("/score-reviews/:id/decision", async (request, reply) => {
    // Bot path: valid service token skips session. Otherwise require
    // controller session (dev with empty token still needs session).
    const botOk =
      getEnv().BOT_SERVICE_TOKEN !== "" && hasBotToken(request);
    if (!botOk) {
      await requireAuth(app)(request, reply);
      if (reply.sent) return;
      await requireScope(app, "controller")(request, reply);
      if (reply.sent) return;
    }
    const { id } = request.params as { id: string };
    const body = request.body as {
      decisions?: unknown;
      decidedBy?: unknown;
      oceeSuggestion?: unknown;
    };
    const review = await repo.findById(id);
    if (!review) {
      return reply
        .code(404)
        .send({ status: "error", message: "Review not found", data: null });
    }
    if (review.status !== "pending") {
      return reply.code(409).send({
        status: "error",
        message: `Review already ${review.status}`,
        data: null,
      });
    }
    if (review.expiresAt && new Date(review.expiresAt) < new Date()) {
      await repo.markExpired(id);
      return reply
        .code(410)
        .send({ status: "error", message: "Review expired", data: null });
    }
    const decisions = (body.decisions ?? {}) as Record<string, string>;
    const candidates = (review.candidates ?? []) as ScoreReviewCandidate[];
    for (const c of candidates) {
      const v = decisions[c.userCode];
      if (v !== "dung" && v !== "sai") {
        return reply.code(400).send({
          status: "error",
          message: `Missing decision for ${label(c.position, c.userName)}`,
          data: null,
        });
      }
    }
    const decidedBy =
      typeof body.decidedBy === "string" ? body.decidedBy : null;
    await repo.decide(id, decisions, decidedBy, body.oceeSuggestion ?? null);

    void writeAudit({
      actionType: "SCORE_CHANGE",
      actorCode: decidedBy,
      matchCode: review.matchCode,
      targetCode: review.questionCode,
      details: `score-review ${id} decided: ${Object.entries(decisions).map(([u, v]) => `${u}=${v}`).join(",")}`,
    });

    // Push result to controllers over WS + notify Discord.
    const payload = {
      type: "score_review_result",
      review_id: id,
      match_code: review.matchCode,
      question_code: review.questionCode,
      decisions,
      decided_by: decidedBy,
    };
    await manager.sendToRoles(review.matchCode, ["controller"], payload);
    try {
      await app.valkey.publish(
        "oc:live-events",
        JSON.stringify({ ...payload, type: "score_review_decided" }),
      );
    } catch {
      /* ignore */
    }
    return reply.send({ status: "success", message: "OK", data: payload });
  });

  // POST /score-reviews/:id/ocee — qauthor asks OCee for suggestion.
  // Same callers as decision: bot token or controller session.
  // Proxies to ai-agent; result stored + returned for embed reference only.
  app.post("/score-reviews/:id/ocee", async (request, reply) => {
    const botOk =
      getEnv().BOT_SERVICE_TOKEN !== "" && hasBotToken(request);
    if (!botOk) {
      await requireAuth(app)(request, reply);
      if (reply.sent) return;
      await requireScope(app, "controller")(request, reply);
      if (reply.sent) return;
    }
    const { id } = request.params as { id: string };
    const review = await repo.findById(id);
    if (!review) {
      return reply
        .code(404)
        .send({ status: "error", message: "Review not found", data: null });
    }
    if (review.status !== "pending") {
      return reply.code(409).send({
        status: "error",
        message: `Review already ${review.status}`,
        data: null,
      });
    }
    const candidates = (review.candidates ?? []) as ScoreReviewCandidate[];
    const questionContent = await repo.findQuestionContent(review.questionId);
    const prompt = [
      `Câu hỏi: ${questionContent?.content ?? review.questionCode}`,
      `Đáp án gốc: ${questionContent?.answer ?? ""}`,
      ...candidates.map(
        (c) => `${label(c.position, c.userName)} trả lời: ${c.answerText}`,
      ),
      "Cho biết từng thí sinh nên được chấp nhận hay không, kèm lý do ngắn.",
    ].join("\n");

    const agentUrl = process.env.AGENT_URL ?? "http://localhost:8100";
    try {
      const resp = await fetch(`${agentUrl}/agent/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_code: review.matchCode,
          question: prompt,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) throw new Error(`Agent error ${resp.status}`);
      const data = (await resp.json()) as {
        answer?: string;
        tools_used?: string[];
      };
      const suggestion = {
        text: data.answer ?? "",
        tools_used: data.tools_used ?? [],
      };
      await repo.saveOceeSuggestion(id, suggestion);
      try {
        await app.valkey.publish(
          "oc:live-events",
          JSON.stringify({
            type: "score_review_ocee",
            review_id: id,
            match_code: review.matchCode,
            suggestion,
          }),
        );
      } catch {
        /* ignore */
      }
      return reply.send({
        status: "success",
        message: "OK",
        data: suggestion,
      });
    } catch (err) {
      return reply.code(502).send({
        status: "error",
        message: err instanceof Error ? err.message : "OCee unavailable",
        data: null,
      });
    }
  });
}
