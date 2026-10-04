import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Send, Trophy } from "lucide-react";
import { ApiError, apiCall, apiGet } from "@/api/client";
import { WS_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { getPlayerCode } from "@/utils/storage";
import { Button } from "@/components/ui/button";
import { parseWebSocketMessage } from "@/types/websocket";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { notifyError } from "@/lib/notify";

const logger = createLogger("PQualifierPage");

interface QualifierQuestion {
  id: string;
  questionCode: string;
  content: string;
  options: string[];
  mediaUrl: string | null;
  position: number;
  status: string;
}

interface Standing {
  playerId: string;
  userCode: string;
  userName: string;
  totalPoints: number;
  correctCount: number;
  avgCorrectTimeSec: number;
  rank: number;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const toQuestion = (row: Record<string, unknown>): QualifierQuestion => ({
  id: String(row.id ?? ""),
  questionCode: String(row.questionCode ?? row.question_code ?? ""),
  content: String(row.content ?? ""),
  options: Array.isArray(row.options) ? (row.options as string[]) : [],
  mediaUrl:
    (row.mediaUrl as string | null) ?? (row.media_url as string | null) ?? null,
  position: Number(row.position ?? 0),
  status: String(row.status ?? "open"),
});

const PQualifierPage = () => {
  const { tournamentCode } = useParams<{ tournamentCode: string }>();
  const code = (tournamentCode ?? "").trim();
  const playerCode = getPlayerCode();

  const [questions, setQuestions] = useState<QualifierQuestion[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [openedAt, setOpenedAt] = useState<Record<string, number>>({});

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const fetchQuestions = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    try {
      const json = await apiGet<Record<string, unknown>[]>(
        `/qualifier/${encodeURIComponent(code)}/questions`,
      );
      if (json.status === "success" && Array.isArray(json.data)) {
        const rows = (json.data as Record<string, unknown>[]).map(toQuestion);
        setQuestions(rows);
        const now = Date.now();
        setOpenedAt((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const q of rows) {
            if (!(q.questionCode in next)) {
              next[q.questionCode] = now;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      } else {
        setQuestions([]);
      }
    } catch (err) {
      logger.error("Error fetching qualifier:", err);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [code]);

  const fetchStandings = useCallback(async () => {
    if (!code) return;
    try {
      const json = await apiGet<Standing[]>(
        `/qualifier/${encodeURIComponent(code)}/standings?limit=16`,
      );
      if (json.status === "success" && Array.isArray(json.data)) {
        setStandings(json.data as Standing[]);
      } else {
        setStandings([]);
      }
    } catch (err) {
      logger.error("Error fetching standings:", err);
      setStandings([]);
    }
  }, [code]);

  useEffect(() => {
    void fetchQuestions();
    void fetchStandings();
  }, [fetchQuestions, fetchStandings]);

  useEffect(() => {
    if (!code) return;
    let socket: WebSocket | null = null;
    let closed = false;
    try {
      socket = new WebSocket(`${WS_BASE_URL}/ws/qualifier_${encodeURIComponent(code)}`);
    } catch {
      return;
    }
    socket.onmessage = (event: MessageEvent<string>) => {
      const msg = parseWebSocketMessage(event.data);
      if (!msg) return;
      if (
        msg.type === "qualifier_opened" ||
        msg.type === "qualifier_updated" ||
        msg.type === "qualifier_deleted" ||
        msg.type === "qualifier_closed"
      ) {
        if (closed) return;
        void fetchQuestions();
        if (msg.type === "qualifier_closed") void fetchStandings();
      }
    };
    return () => {
      closed = true;
      socket?.close(1000, "cleanup");
    };
  }, [code, fetchQuestions, fetchStandings]);

  const current = questions[index] ?? null;
  const currentLetter = current ? selected[current.questionCode] : undefined;
  const currentDone = current ? submitted[current.questionCode] : false;
  const currentElapsedMs = current
    ? Math.max(0, nowMs - (openedAt[current.questionCode] ?? nowMs))
    : 0;
  const currentLeftSec = current
    ? Math.max(0, Math.ceil((10_000 - currentElapsedMs) / 1000))
    : 0;
  const currentTimedOut =
    !!current && !currentDone && currentElapsedMs > 10_000;

  const submit = useCallback(
    async (questionCode: string, letter: string) => {
      if (!code || submitted[questionCode]) return;
      const openedAtMs = openedAt[questionCode] ?? Date.now();
      const responseTimeMs = Math.max(0, Date.now() - openedAtMs);
      if (responseTimeMs > 10_000) return;
      setSubmitting(true);
      try {
        await apiCall(
          `/qualifier/${encodeURIComponent(code)}/questions/${encodeURIComponent(questionCode)}/attempt`,
          {
            method: "POST",
            body: JSON.stringify({ selectedOption: letter, responseTimeMs }),
          },
        );
        setSubmitted((p) => ({ ...p, [questionCode]: true }));
      } catch (err) {
        if (err instanceof ApiError) {
          notifyError(`Nộp thất bại: ${err.message}`);
        } else {
          logger.error("Error submitting attempt:", err);
          notifyError("Lỗi kết nối khi nộp bài");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [code, submitted, openedAt],
  );

  const players: PlayerStatus[] = [];
  const doneCount = Object.keys(submitted).length;

  return (
    <PBasePageLayout players={players} currentPlayerCode={playerCode}>
      <div className="flex flex-col gap-4 p-3 sm:p-4 lg:p-6 min-h-screen text-foreground max-w-3xl mx-auto w-full">
        <div className="flex justify-end">
          <p className="text-xs text-muted-foreground ">
            {code || "(thiếu mã giải)"} · {doneCount}/{questions.length} đã nộp
          </p>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Đang tải đề…</p>
        ) : questions.length === 0 ? (
          <p className="text-muted-foreground text-sm">Chưa có câu hỏi vòng loại.</p>
        ) : (
          current && (
            <>
              <PQuestionBoard
                title={`VÒNG LOẠI - CÂU ${current.position}`}
                question={
                  {
                    questionCode: current.questionCode,
                    questionText: current.content,
                    questionAnswer: "",
                    questionMediaURL: current.mediaUrl ?? undefined,
                  } satisfies Question
                }
                timerDuration={currentLeftSec}
                controls={{
                  variant: "numbers",
                  count: questions.length,
                  activeIndices: [index],
                }}
                questionSelect={(i) => setIndex(i)}
                answeredIndices={
                  new Set(
                    questions.map((q, i) =>
                      submitted[q.questionCode] ? i : -1,
                    ),
                  )
                }
                boardHeightClass="min-h-[30vh]"
              />

              <div className="rounded-xl bg-accent/50 border border-border p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground ">
                    Câu {current.position}/{questions.length} · {current.questionCode}
                    {current.status === "closed" && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-success/20 text-success">Đã chốt</span>
                    )}
                  </p>
                  {currentTimedOut && (
                    <p className="text-xs text-destructive">Hết giờ — tính như bỏ qua (0 điểm).</p>
                  )}
                </div>
                <div className="grid gap-2" role="radiogroup" aria-label="Phương án trả lời">
                  {current.options.map((opt, i) => {
                    const letter = LETTERS[i] ?? String(i + 1);
                    const active = currentLetter === letter;
                    return (
                      <Button
                        key={letter}
                        type="button"
                        variant="ghost"
                        role="radio"
                        aria-checked={active}
                        disabled={currentDone || current.status === "closed" || currentTimedOut}
                        onClick={() => setSelected((p) => ({ ...p, [current.questionCode]: letter }))}
                        className={`min-h-11 flex-1 items-start gap-3 rounded-lg px-4 py-3 text-left text-sm ${
                          active
                            ? "bg-primary text-foreground"
                            : "bg-accent text-foreground/90 hover:bg-accent"
                        }`}
                      >
                        <span className="font-bold  shrink-0">{letter}.</span>
                        <span>{opt}</span>
                      </Button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => currentLetter && void submit(current.questionCode, currentLetter)}
                    disabled={!currentLetter || currentDone || submitting || current.status === "closed" || currentTimedOut}
                    className="flex-1 justify-center gap-2 bg-success hover:bg-success/90 disabled:opacity-50 px-4 py-2 min-h-11 font-semibold text-sm text-success-foreground"
                  >
                    {currentDone ? (
                      <>
                        <CheckCircle2 size={16} /> Đã nộp
                      </>
                    ) : (
                      <>
                        <Send size={16} /> {submitting ? "Đang nộp…" : "Nộp đáp án"}
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Đúng/sai chỉ lộ sau khi chốt câu. Bỏ qua = 0 điểm.
                </p>
              </div>
            </>
          )
        )}

        <div className="rounded-xl bg-accent/50 border border-border p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-brand uppercase tracking-wide">
              <Trophy size={16} /> Top 16
            </h3>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void fetchStandings()}
              className="min-h-9 bg-accent hover:bg-accent px-3 py-1.5 text-xs"
            >
              Làm mới
            </Button>
          </div>
          {standings.length === 0 ? (
            <p className="text-muted-foreground text-sm">Chưa có bảng xếp hạng (chỉ tính câu đã chốt).</p>
          ) : (
            <ol className="flex flex-col gap-1 text-sm">
              {standings.map((s) => (
                <li
                  key={s.playerId}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg ${s.userCode === playerCode ? "bg-primary/30" : "bg-accent/50"}`}
                >
                  <span className=" text-muted-foreground w-6">{s.rank}</span>
                  <span className="flex-1 truncate">{s.userName}</span>
                  <span className="font-bold">{s.totalPoints}đ</span>
                  <span className="text-muted-foreground text-xs">{s.correctCount} đúng</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </PBasePageLayout>
  );
};

export default PQualifierPage;
