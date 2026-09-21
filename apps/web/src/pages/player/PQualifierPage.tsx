import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, ListOrdered, Send, Trophy } from "lucide-react";
import { API_BASE_URL, WS_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { getPlayerCode } from "@/utils/storage";
import { parseWebSocketMessage } from "@/types/websocket";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";

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

interface ApiResponse {
  status: "success" | "error";
  message: string;
  data: unknown;
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
  const openedAtRef = useRef<Record<string, number>>({});

  // Tick 250ms de countdown 10s moi cau.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const fetchQuestions = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/qualifier/${encodeURIComponent(code)}/questions`,
        { credentials: "include" },
      );
      const json: ApiResponse = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        const rows = (json.data as Record<string, unknown>[]).map(toQuestion);
        setQuestions(rows);
        const now = Date.now();
        for (const q of rows) {
          if (!(q.questionCode in openedAtRef.current)) {
            openedAtRef.current[q.questionCode] = now;
          }
        }
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
      const res = await fetch(
        `${API_BASE_URL}/qualifier/${encodeURIComponent(code)}/standings?limit=16`,
        { credentials: "include" },
      );
      const json: ApiResponse = await res.json();
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

  // Realtime: qauthor CRUD/chot cau -> refresh list + standings.
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
  // Moi cau 10s (QUALIFIER_TIME_LIMIT_MS). Het gio → khoa, tinh nhu bo qua.
  const currentElapsedMs = current
    ? Math.max(0, nowMs - (openedAtRef.current[current.questionCode] ?? nowMs))
    : 0;
  const currentLeftSec = current
    ? Math.max(0, Math.ceil((10_000 - currentElapsedMs) / 1000))
    : 0;
  const currentTimedOut =
    !!current && !currentDone && currentElapsedMs > 10_000;

  const submit = useCallback(
    async (questionCode: string, letter: string) => {
      if (!code || submitted[questionCode]) return;
      const openedAt = openedAtRef.current[questionCode] ?? Date.now();
      const responseTimeMs = Math.max(0, Date.now() - openedAt);
      // Chan client-side: qua 10s thi khoa, khong gui.
      if (responseTimeMs > 10_000) return;
      setSubmitting(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/qualifier/${encodeURIComponent(code)}/questions/${encodeURIComponent(questionCode)}/attempt`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ selectedOption: letter, responseTimeMs }),
          },
        );
        const json: ApiResponse = await res.json();
        if (res.ok) {
          setSubmitted((p) => ({ ...p, [questionCode]: true }));
        } else {
          alert(`Nộp thất bại: ${json.message ?? "Lỗi không xác định"}`);
        }
      } catch (err) {
        logger.error("Error submitting attempt:", err);
        alert("Lỗi kết nối khi nộp bài");
      } finally {
        setSubmitting(false);
      }
    },
    [code, submitted],
  );

  const players: PlayerStatus[] = [];
  const doneCount = Object.keys(submitted).length;

  return (
    <PBasePageLayout players={players} currentPlayerCode={playerCode}>
      <div className="flex flex-col gap-4 p-3 sm:p-4 lg:p-6 min-h-screen text-white max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-bold text-blue-300">
            <ListOrdered size={20} /> Vòng loại
          </h1>
          <p className="text-xs text-gray-400 font-mono">
            {code || "(thiếu mã giải)"} · {doneCount}/{questions.length} đã nộp
          </p>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">Đang tải đề…</p>
        ) : questions.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có câu hỏi vòng loại.</p>
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

              <div className="rounded-xl bg-white/5 border border-white/10 p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-500 font-mono">
                    Câu {current.position}/{questions.length} · {current.questionCode}
                    {current.status === "closed" && (
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-300">Đã chốt</span>
                    )}
                  </p>
                  {currentTimedOut && (
                    <p className="text-xs text-red-400">Hết giờ — tính như bỏ qua (0 điểm).</p>
                  )}
                </div>
                <div className="grid gap-2" role="radiogroup" aria-label="Phương án trả lời">
                  {current.options.map((opt, i) => {
                    const letter = LETTERS[i] ?? String(i + 1);
                    const active = currentLetter === letter;
                    return (
                      <button
                        key={letter}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={currentDone || current.status === "closed" || currentTimedOut}
                        onClick={() => setSelected((p) => ({ ...p, [current.questionCode]: letter }))}
                        className={`min-h-11 px-4 py-3 rounded-lg text-left text-sm transition-colors flex gap-3 items-start disabled:opacity-60 ${
                          active
                            ? "bg-blue-600 text-white"
                            : "bg-white/10 text-gray-200 hover:bg-white/20"
                        }`}
                      >
                        <span className="font-bold font-mono shrink-0">{letter}.</span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => currentLetter && void submit(current.questionCode, currentLetter)}
                    disabled={!currentLetter || currentDone || submitting || current.status === "closed" || currentTimedOut}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 min-h-11 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-sm"
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
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Đúng/sai chỉ lộ sau khi chốt câu. Bỏ qua = 0 điểm.
                </p>
              </div>
            </>
          )
        )}

        <div className="rounded-xl bg-white/5 border border-white/10 p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-300 uppercase tracking-wide">
              <Trophy size={16} /> Top 16
            </h3>
            <button
              type="button"
              onClick={() => void fetchStandings()}
              className="px-3 py-1.5 min-h-9 rounded-lg bg-white/10 hover:bg-white/20 text-xs"
            >
              Làm mới
            </button>
          </div>
          {standings.length === 0 ? (
            <p className="text-gray-400 text-sm">Chưa có bảng xếp hạng (chỉ tính câu đã chốt).</p>
          ) : (
            <ol className="flex flex-col gap-1 text-sm">
              {standings.map((s) => (
                <li
                  key={s.playerId}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg ${s.userCode === playerCode ? "bg-blue-600/30" : "bg-white/5"}`}
                >
                  <span className="font-mono text-gray-400 w-6">{s.rank}</span>
                  <span className="flex-1 truncate">{s.userName}</span>
                  <span className="font-bold">{s.totalPoints}đ</span>
                  <span className="text-gray-400 text-xs">{s.correctCount} đúng</span>
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
