import { useCallback, useEffect, useRef, useState } from "react";
import {
  matchStoragePrefixes,
  readMatchJson,
  writeMatchJson,
} from "@/utils/storage";
import { Star, Shield } from "lucide-react";

import { usePlayerRound } from "@/hooks/usePlayerRound";
import { useRoleSession } from "@/hooks/useRoleSession";
import { submitBuzz } from "@/api/answers";

import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PSubmitButton } from "@/components/player/PSubmitButton";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type RoundQuestion = { code: string; category: string; points: number };
export const PlayerVeDichRiengView = () => {
  const { matchCode, playerCode } = useRoleSession("player");
  const {
    isConnected,
    lastMessage,
    sendMessage,
    timer,
    startSynced,
    currentQuestion,
    applyWsMessage,
    players,
    setPlayers,
    applyPlayersInfo,
    applyScoreUpdate,
    videoPlayState,
    setVideoPlayState,
  } = usePlayerRound();

  const [hasPinged, setHasPinged] = useState(false);
  const hasPingedRef = useRef(false);
  const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
  const [blockedPlayerCode, setBlockedPlayerCode] = useState<string | null>(
    null,
  );
  const [currentTurnPlayerCode, setCurrentTurnPlayerCode] = useState<
    string | null
  >(null);
  const [answeringWindowTimer, setAnsweringWindowTimer] = useState(0);
  const [activePower, setActivePower] = useState<"star" | "shield" | null>(
    null,
  );
  const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>(
    [],
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
    if (!lastMessage) return;
    const msg = lastMessage.message ?? lastMessage;
    queueMicrotask(() => {
      applyWsMessage(msg);
      if (msg?.type === "send_question" || msg?.type === "clear_question")
        setVideoPlayState(null);
      switch (msg?.type) {
        case "send_players_info":
          applyPlayersInfo(msg);
          break;
        case "player_score_updated":
          applyScoreUpdate(msg);
          break;
        case "start_the_timer":
          hasPingedRef.current = false;
          setHasPinged(false);
          setBuzzerWinnerCode(null);
          setAnsweringWindowTimer(0);
          startSynced(
            Number(msg.time_limit ?? 0),
            Number(msg.started_at ?? Date.now()),
          );
          setPlayers((prev) =>
            prev.map((p) => ({ ...p, playerHasBuzzed: false })),
          );
          break;
        case "media_control":
          setVideoPlayState(msg.action === "pause" ? "paused" : "playing");
          break;
        case "vd_power_activated":
          setActivePower(msg.power ?? null);
          break;
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
        case "buzzer_winner": {
          const winner = String(msg.user_code ?? "");
          if (winner) {
            setBuzzerWinnerCode(winner);
            setPlayers((prev) =>
              prev.map((p) => ({
                ...p,
                playerHasBuzzed: p.playerCode === winner,
              })),
            );
          }
          break;
        }
        case "clear_buzz":
          hasPingedRef.current = false;
          setHasPinged(false);
          setBuzzerWinnerCode(null);
          setPlayers((prev) =>
            prev.map((p) => ({ ...p, playerHasBuzzed: false })),
          );
          break;
        case "blocked_buzz":
          setBlockedPlayerCode(
            msg.user_code === null || msg.user_code === undefined
              ? "*ALL*"
              : msg.user_code === ""
                ? null
                : String(msg.user_code),
          );
          break;
        case "vd_questions_selected":
        case "vdr_questions_meta": {
          const metadata: RoundQuestion[] = msg.question_metadata ?? [];
          if (metadata.length > 0) setRoundQuestionsData(metadata);
          if (msg.round === "rieng" && msg.selected_player_code)
            setCurrentTurnPlayerCode(msg.selected_player_code);
          if (msg.type === "vd_questions_selected") {
            hasPingedRef.current = false;
            setHasPinged(false);
            setBuzzerWinnerCode(null);
            setPlayers((prev) =>
              prev.map((p) => ({ ...p, playerHasBuzzed: false })),
            );
          }
          break;
        }
        case "vdr_question_state": {
          const { question_code, state: qState } = msg;
          if (question_code && qState)
            setQuestionStates((prev) => ({ ...prev, [question_code]: qState }));
          break;
        }
        case "buzzer_activated":
          setAnsweringWindowTimer(5);
          break;
      }
    });
  }, [
    lastMessage,
    matchCode,
    playerCode,
    setPlayers,
    applyWsMessage,
    applyPlayersInfo,
    applyScoreUpdate,
    setVideoPlayState,
    startSynced,
  ]);

  useEffect(() => {
    if (answeringWindowTimer <= 0) return;
    const id = window.setInterval(
      () => setAnsweringWindowTimer((prev) => (prev <= 1 ? 0 : prev - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [answeringWindowTimer]);
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

  const handlePing = useCallback(async () => {
    if (
      !isConnected ||
      hasPingedRef.current ||
      buzzerWinnerCode ||
      blockedPlayerCode === playerCode ||
      currentTurnPlayerCode === playerCode ||
      !currentQuestion.questionCode ||
      answeringWindowTimer <= 0
    )
      return;
    hasPingedRef.current = true;
    setHasPinged(true);
    try {
      const submitted = await submitBuzz({
        user_code: playerCode,
        match_code: matchCode,
        question_code: currentQuestion.questionCode,
        has_buzzed: true,
      });
      if (!submitted) {
        hasPingedRef.current = false;
        setHasPinged(false);
        return;
      }
    } catch {
      hasPingedRef.current = false;
      setHasPinged(false);
      return;
    }
    await sendMessage({
      type: "buzz",
      user_code: playerCode,
      question_code: currentQuestion.questionCode,
      has_buzzed: true,
    });
  }, [
    buzzerWinnerCode,
    currentQuestion.questionCode,
    isConnected,
    playerCode,
    sendMessage,
    matchCode,
    blockedPlayerCode,
    currentTurnPlayerCode,
    answeringWindowTimer,
  ]);

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

  const isPingDisabled =
    hasPinged ||
    !isConnected ||
    !!buzzerWinnerCode ||
    blockedPlayerCode === playerCode ||
    currentTurnPlayerCode === playerCode ||
    answeringWindowTimer <= 0;
  const currentPoints =
    roundQuestionsData.find((r) => r.code === currentQuestion.questionCode)
      ?.points ?? 0;

  return (
    <PBasePageLayout
      players={players}
      currentPlayerCode={playerCode}
      currentTurnPlayerCode={currentTurnPlayerCode}
      buzzerWinnerCode={buzzerWinnerCode}
    >
      <PQuestionBoard
        title="VỀ ĐÍCH - LƯỢT CÁ NHÂN"
        question={currentQuestion}
        timerDuration={answeringWindowTimer > 0 ? answeringWindowTimer : timer}
        videoPlayState={videoPlayState}
      >
        <div className="flex gap-1 overflow-x-auto">
          {roundQuestionsData.length > 0
            ? roundQuestionsData.map((q) => {
                const qState = questionStates[q.code] ?? "available";
                return (
                  <div
                    key={q.code}
                    className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20"
                  >
                    <VeDichQuestionCard
                      category={q.category}
                      points={q.points}
                      state={qState}
                      isSelected={currentQuestion.questionCode === q.code}
                      disabled={qState !== "available"}
                    />
                  </div>
                );
              })
            : Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`ph-${i}`}
                  className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20"
                >
                  <VeDichQuestionCard placeholder category="" disabled />
                </div>
              ))}
        </div>
      </PQuestionBoard>
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
              className={`gap-2 rounded-xl px-4 py-3 font-bold ${selectedPower === "star" ? "bg-warning text-background" : "bg-warning/20 text-warning border-2 border-warning/50"} ${currentPoints === 20 ? "opacity-40" : ""}`}
            >
              <Star size={20} />
              <span>Ngôi Sao Hy Vọng</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="shield"
              disabled={currentPoints === 50}
              className={`gap-2 rounded-xl px-4 py-3 font-bold ${selectedPower === "shield" ? "bg-primary text-background" : "bg-primary/20 text-brand border-2 border-primary/50"} ${currentPoints === 50 ? "opacity-40" : ""}`}
            >
              <Shield size={20} />
              <span>Bảo Hộ Miễn Trừ</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      <div className="p-3">
        <PSubmitButton isEnabled={!isPingDisabled} onSubmit={handlePing} />
      </div>
      {activePower && (
        <div className="mx-3 mt-2 p-3 bg-primary/60 border-2 border-brand rounded-xl flex items-center gap-3">
          {activePower === "star" ? (
            <>
              <Star size={20} className="text-warning shrink-0" />
              <span className="font-bold text-warning">
                Ngôi sao hy vọng
              </span>
              <span className="text-warning text-sm">
                Đúng: +150% · Sai: -100%
              </span>
            </>
          ) : (
            <>
              <Shield size={20} className="text-brand shrink-0" />
              <span className="font-bold text-brand">Bảo hộ miễn trừ</span>
              <span className="text-foreground/80 text-sm">
                Đúng: +50% · Sai: không trừ
              </span>
            </>
          )}
        </div>
      )}
    </PBasePageLayout>
  );
};
