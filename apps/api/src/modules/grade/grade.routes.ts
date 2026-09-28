import type { FastifyInstance } from "fastify";
import {
  answersMatch,
  isCorrectOption,
  normalizeMathAnswer,
} from "@oc/engine";
import { isOperatorLike, requireAuth } from "../auth/auth.service.js";
import { resolveMatchId } from "../../state/id-cache.js";
import { drizzleQuestionRepo } from "../question/question.repo.js";
import { drizzleAnswerRepo } from "../answer/answer.repo.js";
import { AppError } from "../../utils/errors.js";

type GradeMode = "auto" | "mcq";

function isStaffSession(session: {
  role: string;
  operatorScopes?: string | null;
}): boolean {
  return session.role === "admin" || isOperatorLike(session.role);
}
function grade(candidate: string, expected: string, mode: GradeMode) {
  const correct =
    mode === "mcq"
      ? isCorrectOption(candidate, expected)
      : answersMatch(candidate, expected);
  return {
    correct,
    mode,
    normalized: {
      candidate: normalizeMathAnswer(candidate),
      expected: normalizeMathAnswer(expected),
    },
  };
}

export async function gradeRoutes(app: FastifyInstance) {
  // POST /grade — chấm 1 đáp án bằng engine. Staff-only.
  app.post(
    "/grade",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = (request as unknown as { session: {
        role: string;
        operatorScopes?: string | null;
      } }).session;
      if (!isStaffSession(session)) throw new AppError(403, "Staff only");
      const body = request.body as {
        candidate?: unknown;
        expected?: unknown;
        mode?: unknown;
      };
      if (typeof body.candidate !== "string" || typeof body.expected !== "string") {
        throw new AppError(400, "candidate and expected are required");
      }
      const mode: GradeMode = body.mode === "mcq" ? "mcq" : "auto";
      return reply.send({
        status: "success",
        message: "OK",
        data: grade(body.candidate, body.expected, mode),
      });
    },
  );

  // POST /grade/question — chấm toàn bộ bài 1 câu. Staff-only
  // (đọc đáp án gốc + bài thí sinh), giống guard GET /answers/:match/:question.
  app.post(
    "/grade/question",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = (request as unknown as { session: {
        role: string;
        operatorScopes?: string | null;
      } }).session;
      if (!isStaffSession(session)) throw new AppError(403, "Staff only");

      const body = request.body as {
        match_code?: unknown;
        question_code?: unknown;
        mode?: unknown;
        anonymize?: unknown;
      };
      if (typeof body.match_code !== "string" || typeof body.question_code !== "string") {
        throw new AppError(400, "match_code and question_code are required");
      }
      const mode: GradeMode = body.mode === "mcq" ? "mcq" : "auto";
      // Agent chỉ quan tâm nội dung — ẩn user_code mặc định, thay label TS1..n.
      const anonymize = body.anonymize !== false;

      const matchId = await resolveMatchId(app.valkey, body.match_code);
      if (!matchId) throw new AppError(404, "Match not found");
      const question = await drizzleQuestionRepo.findByCode(matchId, body.question_code);
      if (!question) throw new AppError(404, "Question not found");

      const rows = await drizzleAnswerRepo.listByQuestion(matchId, question.id);
      const results = rows.map((r, i) => ({
        ...(anonymize
          ? { label: `TS${i + 1}` }
          : { userCode: r.userCode }),
        candidate: r.answerText ?? "",
        ...grade(r.answerText ?? "", question.answer, mode),
      }));
      return reply.send({
        status: "success",
        message: "OK",
        data: {
          questionCode: body.question_code,
          expected: question.answer,
          mode,
          total: results.length,
          correctCount: results.filter((r) => r.correct).length,
          results,
        },
      });
    },
  );
}
