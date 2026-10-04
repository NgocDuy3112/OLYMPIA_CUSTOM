import { useCallback, useEffect, useRef, useState } from "react";
import {
  matchStoragePrefixes,
  readMatchJson,
  writeMatchJson,
} from "@/utils/storage";
import { Star, Shield } from "lucide-react";

import { usePlayerRound } from "@/hooks/usePlayerRound";
import { useRoleSession } from "@/hooks/useRoleSession";
import { submitAnswer } from "@/api/answers";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type RoundQuestion = { code: string; category: string; points: number };
export const PlayerVeDichChungView = () => {
  const { matchCode, playerCode } = useRoleSession("player");
  const {
    isConnected,
    sendMessage,
    timer,
    timeLimit,
    getElapsedSeconds,
    currentQuestion,
    players,
    setPlayers,
    lastMessage,
    showAnswers,
    videoPlayState,
  } = usePlayerRound();
  const activePlayers = players.filter((player) => !player.playerAfk);
  const [answer, setAnswer] = useState("");
  const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>(
    () => {
      if (!matchCode) return [];
      return readMatchJson<RoundQuestion[]>(
        matchStoragePrefixes.chungMeta,
        matchCode,
        [],
      );
    },
  );
  const [questionStates, setQuestionStates] = useState<
    Record<string, "answered" | "answered-wrong" | "available">
  >({});
  const [usedPowers, setUsedPowers] = useState<Record<string, string | null>>(
    () => {
      if (!matchCode) return {};
      return readMatchJson<Record<string, string | null>>(
        matchStoragePrefixes.powers,
        matchCode,
        {},
      );
    },
  );
  const [powerWindowOpen, setPowerWindowOpen] = useState(false);
  const [powerWindowCountdown, setPowerWindowCountdown] = useState(0);
  const [selectedPower, setSelectedPower] = useState<"star" | "shield" | null>(
    null,
  );
  const powerWindowTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  useEffect(() => {
    if (!matchCode || !isConnected || roundQuestionsData.length > 0) return;
    sendMessage({ type: "vd_questions_meta_request", match_code: matchCode });
  }, [matchCode, isConnected, roundQuestionsData.length, sendMessage]);

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage.message ?? lastMessage;
    switch (msg?.type) {
      case "vdc_question_state": {
        const { question_code, state: qState } = msg;
        if (question_code && qState)
          setQuestionStates((prev) => ({ ...prev, [question_code]: qState }));
        break;
      }
      case "vd_questions_selected":
      case "vdc_questions_meta": {
        const metadata: RoundQuestion[] = msg.question_metadata ?? [];
        if (metadata.length > 0) {
          setRoundQuestionsData(metadata);
          writeMatchJson(matchStoragePrefixes.chungMeta, matchCode, metadata);
        }
        break;
      }
      case "vd_power_window_open": {
        const eligible = msg.eligible_user_codes;
        if (Array.isArray(eligible) && !eligible.includes(playerCode ?? ""))
          break;
        setPowerWindowOpen(true);
        setPowerWindowCountdown(Number(msg.duration ?? 5));
        setSelectedPower(null);
        break;
      }
      case "vd_player_power": {
        const { user_code, power } = msg;
        if (user_code && (power === "star" || power === "shield")) {
          setUsedPowers((prev) => {
            const next = { ...prev, [user_code]: power };
            writeMatchJson(matchStoragePrefixes.powers, matchCode, next);
            return next;
          });
          setPlayers((prev) =>
            prev.map((p) =>
              p.playerCode === user_code ? { ...p, playerPower: power } : p,
            ),
          );
        }
        break;
      }
      case "vd_powers_used": {
        if (msg.used_powers) {
          setUsedPowers(msg.used_powers);
          writeMatchJson(
            matchStoragePrefixes.powers,
            matchCode,
            msg.used_powers,
          );
          setPlayers((prev) =>
            prev.map((p) => {
              const power = msg.used_powers[p.playerCode];
              return power ? { ...p, playerPower: power } : p;
            }),
          );
        }
        break;
      }
    }
  }, [lastMessage, matchCode, playerCode, setPlayers]);

  useEffect(() => {
    if (!powerWindowOpen || powerWindowCountdown <= 0) return;
    powerWindowTimerRef.current = window.setInterval(() => {
      setPowerWindowCountdown((prev) => {
        if (prev <= 1) {
          setPowerWindowOpen(false);
          void sendMessage({
            type: "vd_power_window_closed",
            user_code: playerCode,
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (powerWindowTimerRef.current)
        window.clearInterval(powerWindowTimerRef.current);
    };
  }, [powerWindowOpen, powerWindowCountdown, playerCode, sendMessage]);
  useEffect(
    () => () => {
      if (powerWindowTimerRef.current)
        window.clearInterval(powerWindowTimerRef.current);
    },
    [],
  );

  const handleSelectPower = useCallback(
    async (power: "star" | "shield") => {
      if (!powerWindowOpen || usedPowers[playerCode]) return;
      setSelectedPower(power);
      setPowerWindowOpen(false);
      await sendMessage({
        type: "vd_player_power",
        user_code: playerCode,
        power,
      });
    },
    [powerWindowOpen, usedPowers, playerCode, sendMessage],
  );

  const handleSubmitAnswer = useCallback(async () => {
    const trimmed = answer.trim();
    if (!trimmed || !isConnected || timer <= 0 || !currentQuestion.questionCode)
      return;
    const elapsed = getElapsedSeconds();
    const ts = Math.max(0, Math.min(timeLimit, elapsed));
    setPlayers((prev) =>
      prev.map((p) =>
        p.playerCode === playerCode
          ? {
              ...p,
              playerLastAnswer: trimmed,
              playerTimestamp: Number(ts.toFixed(3)),
            }
          : p,
      ),
    );
    try {
      await submitAnswer({
        user_code: playerCode,
        match_code: matchCode,
        question_code: currentQuestion.questionCode,
        answer_text: trimmed,
        has_buzzed: false,
        timestamp: ts,
      });
      await sendMessage({
        type: "player_answer",
        user_code: playerCode,
        question_code: currentQuestion.questionCode,
        answer_text: trimmed,
        timestamp: ts,
      });
    } catch (error) {
      console.warn("Failed to submit answer:", error);
    }
    setAnswer("");
  }, [
    answer,
    currentQuestion.questionCode,
    getElapsedSeconds,
    isConnected,
    matchCode,
    playerCode,
    sendMessage,
    setPlayers,
    timeLimit,
    timer,
    setAnswer,
  ]);

  const currentPoints =
    roundQuestionsData.find((r) => r.code === currentQuestion.questionCode)
      ?.points ?? 0;
  const displayPlayers = players.map((p) =>
    showAnswers || p.playerCode === playerCode
      ? p
      : { ...p, playerLastAnswer: undefined, playerTimestamp: undefined },
  );

  return (
    <PBasePageLayout players={displayPlayers} currentPlayerCode={playerCode}>
      <PQuestionBoard
        title="VỀ ĐÍCH - LƯỢT CHUNG"
        question={currentQuestion}
        timerDuration={timer}
        videoPlayState={videoPlayState}
      >
        <div className="flex gap-1 overflow-x-auto">
          {roundQuestionsData.length > 0
            ? roundQuestionsData.map((q) => {
                const qState = questionStates[q.code] ?? "available";
                const isActive = currentQuestion.questionCode === q.code;
                return (
                  <div
                    key={q.code}
                    className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20"
                  >
                    <VeDichQuestionCard
                      category={q.category}
                      points={q.points}
                      state={qState}
                      isSelected={isActive}
                      disabled={qState !== "available"}
                    />
                  </div>
                );
              })
            : Array.from({ length: activePlayers.length || 2 }).map((_, i) => (
                <div
                  key={`ph-${i}`}
                  className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20"
                >
                  <VeDichQuestionCard placeholder category="" disabled />
                </div>
              ))}
        </div>
      </PQuestionBoard>
      <PAnswerBox
        answer={answer}
        setAnswer={setAnswer}
        isDisabled={!isConnected || timer <= 0}
        onSubmit={handleSubmitAnswer}
        placeholderString={
          timer <= 0
            ? "Bạn không thể nhập đáp án tại thời điểm này"
            : "Nhập đáp án và nhấn Enter"
        }
      />
      {powerWindowOpen && !usedPowers[playerCode] && (
        <div className="bg-primary/40 border-2 border-brand rounded-xl p-4 flex flex-col items-center gap-3">
          <p className="text-foreground font-bold text-lg">
            Chọn quyền năng ({powerWindowCountdown}s)
          </p>
          <ToggleGroup
            spacing={4}
            value={selectedPower ? [selectedPower] : []}
            onValueChange={(next) => {
              const arr = (Array.isArray(next) ? next : [next]) as string[];
              const pick = arr.find((v) => v === "star" || v === "shield");
              if (pick && pick !== selectedPower) {
                void handleSelectPower(pick as "star" | "shield");
              }
            }}
          >
            <ToggleGroupItem
              value="star"
              disabled={currentPoints === 20}
              className={`gap-2 rounded-xl px-4 py-3 font-bold ${selectedPower === "star" ? "bg-warning text-background ring-2 ring-warning" : "bg-warning/20 text-warning border-2 border-warning/50 hover:bg-warning/40"} ${currentPoints === 20 ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <Star size={20} />
              <span>Ngôi Sao Hy Vọng</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="shield"
              disabled={currentPoints === 50}
              className={`gap-2 rounded-xl px-4 py-3 font-bold ${selectedPower === "shield" ? "bg-primary text-background ring-2 ring-brand" : "bg-primary/20 text-brand border-2 border-primary/50 hover:bg-primary/40"} ${currentPoints === 50 ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <Shield size={20} />
              <span>Bảo Hộ Miễn Trừ</span>
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-brand text-sm">
            Chỉ được dùng 1 lần xuyên suốt VĐC & VĐR
          </p>
        </div>
      )}
      {!powerWindowOpen && usedPowers[playerCode] && (
        <div className="bg-primary/60 border-2 border-brand rounded-xl p-3 flex items-center gap-2 font-bold text-sm text-foreground/80">
          {usedPowers[playerCode] === "star" ? (
            <Star size={18} className="shrink-0" />
          ) : (
            <Shield size={18} className="shrink-0" />
          )}
          <span>
            Bạn đã dùng Quyền năng{" "}
            {usedPowers[playerCode] === "star"
              ? "Ngôi Sao Hy Vọng"
              : "Bảo Hộ Miễn Trừ"}
            .
          </span>
        </div>
      )}
    </PBasePageLayout>
  );
};
