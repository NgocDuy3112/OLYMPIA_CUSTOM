import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import {
  db,
  scoreReviews,
  answers,
  questions,
  matches,
  users,
  matchPlayerPositions,
} from "@oc/db";
import { resolveMatchId } from "../../state/id-cache.js";
import { requireScope } from "../auth/auth.service.js";
import { AppError } from "../../utils/errors.js";
import { writeAudit } from "../audit/audit.service.js";
import { manager } from "../ws/ws.manager.js";

const REVIEW_TTL_SECONDS = 10 * 60;

interface CandidateInput {
  userCode: string;
  answerText?: string;
}

interface Candidate {
  userCode: string;
  userName: string;
  position: number | null;
  answerText: string;
}

function label(position: number | null, userName: string): string {
  return `[${position ?? "?"}] ${userName}`;
}

async function loadCandidates(
  matchId: string,
  questionId: string,
  inputs: CandidateInput[],
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const input of inputs) {
    const userRows = await db
      .select({ id: users.id, userName: users.userName })
      .from(users)
      .where(
        and(eq(users.userCode, input.userCode), eq(users.isDeleted, false)),
      )
      .limit(1);
    if (userRows.length === 0) throw new AppError(404, `Player not found: ${input.userCode}`);
    let answerText = input.answerText ?? "";
    if (!answerText) {
      const answerRows = await db
        .select({ answerText: answers.answerText })
        .from(answers)
        .where(
          and(
            eq(answers.matchId, matchId),
            eq(answers.playerId, userRows[0].id),
            eq(answers.questionId, questionId),
            eq(answers.isDeleted, false),
          ),
        )
        .limit(1);
      answerText = answerRows[0]?.answerText ?? "";
    }
    const posRows = await db
      .select({ position: matchPlayerPositions.position })
      .from(matchPlayerPositions)
      .where(
        and(
          eq(matchPlayerPositions.matchId, matchId),
          eq(matchPlayerPositions.playerId, userRows[0].id),
        ),
      )
      .limit(1);
    out.push({
      userCode: input.userCode,
      userName: userRows[0].userName,
      position: posRows[0]?.position ?? null,
      answerText,
    });
  }
  out.sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  return out;
}

export async function scoreReviewRoutes(app: FastifyInstance) {
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
      const matchCode = typeof body.match_code === "string" ? body.match_code : "";
      const questionCode = typeof body.question_code === "string" ? body.question_code : "";
      const rawCandidates = Array.isArray(body.candidates) ? body.candidates : [];
      if (!matchCode || !questionCode || rawCandidates.length === 0) {
        throw new AppError(400, "match_code, question_code, candidates required");
      }
      if (rawCandidates.length > 4) {
        throw new AppError(400, "At most 4 candidates per review");
      }
      const inputs: CandidateInput[] = rawCandidates.map((c) => {
        const obj = c as Record<string, unknown>;
        const userCode = typeof obj.userCode === "string" ? obj.userCode : typeof obj.user_code === "string" ? obj.user_code : "";
        const answerText = typeof obj.answerText === "string" ? obj.answerText : typeof obj.answer_text === "string" ? obj.answer_text : "";
        if (!userCode) throw new AppError(400, "Each candidate needs userCode");
        return { userCode, answerText };
      });

      const matchId = await resolveMatchId(app.valkey, matchCode);
      if (!matchId) throw new AppError(404, "Match not found");
      const questionRows = await db
        .select({ id: questions.id, content: questions.content, answer: questions.answer })
        .from(questions)
        .where(
          and(
            eq(questions.matchId, matchId),
            eq(questions.questionCode, questionCode),
            eq(questions.isDeleted, false),
          ),
        )
        .limit(1);
      if (questionRows.length === 0) throw new AppError(404, "Question not found");

      const candidates = await loadCandidates(matchId, questionRows[0].id, inputs);
      const session = (request as { session?: { userCode?: string } }).session;
      const expiresAt = new Date(Date.now() + REVIEW_TTL_SECONDS * 1000);
      const inserted = await db
        .insert(scoreReviews)
        .values({
          matchId,
          questionId: questionRows[0].id,
          matchCode,
          questionCode,
          candidates,
          decisions: {},
          status: "pending",
          createdBy: session?.userCode,
          expiresAt,
        })
        .returning({ id: scoreReviews.id });
      const reviewId = inserted[0].id;

      // Fire-and-forget Discord ping via Valkey — bot posts embed + buttons.
      try {
        await app.valkey.publish(
          "oc:live-events",
          JSON.stringify({
            type: "score_review_request",
            review_id: reviewId,
            match_code: matchCode,
            question_code: questionCode,
            question_content: questionRows[0].content,
            question_answer: questionRows[0].answer,
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
        actorCode: session?.userCode ?? null,
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

  // GET /score-reviews/:id — controller/qauthor poll state.
  app.get("/score-reviews/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await db.select().from(scoreReviews).where(eq(scoreReviews.id, id)).limit(1);
    if (rows.length === 0) {
      return reply.code(404).send({ status: "error", message: "Review not found", data: null });
    }
    return reply.send({ status: "success", message: "OK", data: rows[0] });
  });

  // POST /score-reviews/:id/decision — bot callback (qauthor verdict).
  // Body: { decisions: { [userCode]: "dung" | "sai" }, decidedBy, oceeSuggestion? }
  app.post("/score-reviews/:id/decision", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      decisions?: unknown;
      decidedBy?: unknown;
      oceeSuggestion?: unknown;
    };
    const rows = await db.select().from(scoreReviews).where(eq(scoreReviews.id, id)).limit(1);
    if (rows.length === 0) {
      return reply.code(404).send({ status: "error", message: "Review not found", data: null });
    }
    const review = rows[0];
    if (review.status !== "pending") {
      return reply.code(409).send({ status: "error", message: `Review already ${review.status}`, data: null });
    }
    if (review.expiresAt && new Date(review.expiresAt) < new Date()) {
      await db.update(scoreReviews).set({ status: "expired", updatedAt: new Date() }).where(eq(scoreReviews.id, id));
      return reply.code(410).send({ status: "error", message: "Review expired", data: null });
    }
    const decisions = (body.decisions ?? {}) as Record<string, string>;
    const candidates = (review.candidates ?? []) as Candidate[];
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
    const decidedBy = typeof body.decidedBy === "string" ? body.decidedBy : null;
    await db
      .update(scoreReviews)
      .set({
        decisions,
        decidedBy,
        oceeSuggestion: (body.oceeSuggestion ?? null) as never,
        status: "decided",
        updatedAt: new Date(),
      })
      .where(eq(scoreReviews.id, id));

    const matchRow = await db
      .select({ tournamentId: matches.tournamentId })
      .from(matches)
      .where(eq(matches.id, review.matchId))
      .limit(1);
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
      await app.valkey.publish("oc:live-events", JSON.stringify({ ...payload, type: "score_review_decided" }));
    } catch {
      /* ignore */
    }
    void matchRow;
    return reply.send({ status: "success", message: "OK", data: payload });
  });

  // POST /score-reviews/:id/ocee — qauthor asks OCee for suggestion.
  // Proxies to ai-agent; result stored + returned for embed reference only.
  app.post("/score-reviews/:id/ocee", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await db.select().from(scoreReviews).where(eq(scoreReviews.id, id)).limit(1);
    if (rows.length === 0) {
      return reply.code(404).send({ status: "error", message: "Review not found", data: null });
    }
    const review = rows[0];
    if (review.status !== "pending") {
      return reply.code(409).send({ status: "error", message: `Review already ${review.status}`, data: null });
    }
    const candidates = (review.candidates ?? []) as Candidate[];
    const questionRows = await db
      .select({ content: questions.content, answer: questions.answer })
      .from(questions)
      .where(eq(questions.id, review.questionId))
      .limit(1);
    const prompt = [
      `Câu hỏi: ${questionRows[0]?.content ?? review.questionCode}`,
      `Đáp án gốc: ${questionRows[0]?.answer ?? ""}`,
      ...candidates.map((c) => `${label(c.position, c.userName)} trả lời: ${c.answerText}`),
      "Cho biết từng thí sinh nên được chấp nhận hay không, kèm lý do ngắn.",
    ].join("\n");

    const agentUrl = process.env.AGENT_URL ?? "http://localhost:8100";
    try {
      const resp = await fetch(`${agentUrl}/agent/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_code: review.matchCode, question: prompt }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) throw new Error(`Agent error ${resp.status}`);
      const data = (await resp.json()) as { answer?: string; tools_used?: string[] };
      const suggestion = { text: data.answer ?? "", tools_used: data.tools_used ?? [] };
      await db
        .update(scoreReviews)
        .set({ oceeSuggestion: suggestion as never, updatedAt: new Date() })
        .where(eq(scoreReviews.id, id));
      try {
        await app.valkey.publish(
          "oc:live-events",
          JSON.stringify({ type: "score_review_ocee", review_id: id, match_code: review.matchCode, suggestion }),
        );
      } catch {
        /* ignore */
      }
      return reply.send({ status: "success", message: "OK", data: suggestion });
    } catch (err) {
      return reply.code(502).send({
        status: "error",
        message: err instanceof Error ? err.message : "OCee unavailable",
        data: null,
      });
    }
  });
}
