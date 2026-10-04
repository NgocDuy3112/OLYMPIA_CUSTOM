import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { usePlayerRound } from "@/hooks/usePlayerRound";
import { useRoleSession } from "@/hooks/useRoleSession";
import { buildKeywordBanner } from "@/utils/keywordBanner";
import { submitAnswer } from "@/api/answers";
import { RenderMedia } from "@/components/shared/RenderMedia";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CLUE_COUNT } from "@/pages/game/giaiMaShared";
import type { ClueState, RevealedHint } from "@/pages/game/giaiMaShared";

const isMediaFilename = (v: string): boolean =>
  /\.(mp3|ogg|wav|aac|m4a|mp4|webm|mov|jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(
    v.trim(),
  );

export const PlayerGiaiMaView = () => {
  const { matchCode, playerCode } = useRoleSession("player");
  const {
    isConnected,
    lastMessage,
    sendMessage,
    timer,
    timeLimit,
    startSynced,
    getElapsedSeconds,
    currentQuestion,
    applyWsMessage,
    players,
    setPlayers,
    applyPlayersInfo,
    applyScoreUpdate,
  } = usePlayerRound();

  const [clueStates, setClueStates] = useState<ClueState[]>(() =>
    Array(CLUE_COUNT).fill("idle"),
  );
  const [revealedHints, setRevealedHints] = useState<
    Record<number, RevealedHint>
  >({});
  const [keywordBanner, setKeywordBanner] = useState(
    "MẬT MÃ GỒM CÓ ... CHỮ CÁI",
  );
  const [keywordAnswer, setKeywordAnswer] = useState<string | null>(null);
  const [hideQuestionContent, setHideQuestionContent] = useState(false);
  const activeClueIdxRef = useRef<number | null>(null);
  const [isKeywordPhase, setIsKeywordPhase] = useState(false);
  const [isKeywordLocked, setIsKeywordLocked] = useState(false);
  const [isKeywordCluesLocked, setIsKeywordCluesLocked] = useState(false);
  const [timerHasStarted, setTimerHasStarted] = useState(false);
  const [questionAnswer, setQuestionAnswer] = useState("");
  const [keyword, setKeyword] = useState("");
  const [hasSubmittedKeyword, setHasSubmittedKeyword] = useState(false);
  const [keywordSubmittedCodes, setKeywordSubmittedCodes] = useState<
    Set<string>
  >(new Set());
  const [showAnswers, setShowAnswers] = useState(false);
  const [showKeywordConfirm, setShowKeywordConfirm] = useState(false);
  const [keywordToConfirm, setKeywordToConfirm] = useState("");

  const resetGameState = useCallback(() => {
    setKeywordAnswer(null);
    setClueStates(Array(CLUE_COUNT).fill("idle"));
    setRevealedHints({});
    setKeywordSubmittedCodes(new Set());
    setShowAnswers(false);
    setHasSubmittedKeyword(false);
    setTimerHasStarted(false);
    setIsKeywordLocked(false);
    setHideQuestionContent(false);
    setIsKeywordPhase(false);
    setIsKeywordCluesLocked(false);
    setPlayers((prev) =>
      prev.map((p) => ({ ...p, playerKeywordCluesOpened: undefined })),
    );
    activeClueIdxRef.current = null;
  }, [setPlayers]);

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage.message ?? lastMessage;
    queueMicrotask(() => {
      applyWsMessage(msg);
      switch (msg?.type) {
        case "send_players_info":
          applyPlayersInfo(msg);
          break;
        case "send_question": {
          const code = String(msg.question_code ?? "");
          const m = code.match(/(\d+)\s*$/);
          const clueNumber = m ? Number(m[1]) : 0;
          if (clueNumber >= 1 && clueNumber <= CLUE_COUNT) {
            const idx = clueNumber - 1;
            activeClueIdxRef.current = idx;
            setClueStates((prev) =>
              prev.map((s, i) =>
                i === idx ? "active" : s === "active" ? "used" : s,
              ),
            );
          }
          setHideQuestionContent(false);
          break;
        }
        case "start_the_timer": {
          const isKeyword = msg.phase === "gm_keyword";
          if (isKeyword) setIsKeywordLocked(false);
          startSynced(
            Number(msg.time_limit ?? 0),
            Number(msg.started_at ?? Date.now()),
          );
          setTimerHasStarted(true);
          if (!isKeyword) {
            setQuestionAnswer("");
            setKeyword("");
          }
          setIsKeywordPhase(isKeyword);
          break;
        }
        case "clear_question":
        case "round_start":
          resetGameState();
          break;
        case "show_hint": {
          const hintContent = msg.hint_content ?? "";
          const hintMedia = msg.hint_media_source ?? "";
          const targets: string[] = Array.isArray(msg.target_players)
            ? msg.target_players.map(String)
            : [];
          const canSee =
            targets.length === 0 || targets.includes(String(playerCode));
          const contentIsMedia = isMediaFilename(hintContent);
          const displayText = canSee
            ? contentIsMedia
              ? hintMedia
              : hintContent
            : "";
          const displayMedia = canSee
            ? contentIsMedia
              ? hintContent
              : hintMedia
            : "";
          setHideQuestionContent(true);
          const explicitIdx = Number(msg.clue_index);
          const codeMatch = String(msg.question_code ?? "").match(/(\d+)\s*$/);
          const codeIdx = codeMatch ? Number(codeMatch[1]) - 1 : null;
          const resolvedIdx =
            Number.isInteger(explicitIdx) &&
            explicitIdx >= 0 &&
            explicitIdx < CLUE_COUNT
              ? explicitIdx
              : Number.isInteger(codeIdx) &&
                  codeIdx !== null &&
                  codeIdx >= 0 &&
                  codeIdx < CLUE_COUNT
                ? codeIdx
                : null;
          if (resolvedIdx !== null) {
            activeClueIdxRef.current = resolvedIdx;
            setClueStates((prev) =>
              prev[resolvedIdx] === "used"
                ? prev
                : prev.map((s, i) => (i === resolvedIdx ? "used" : s)),
            );
            setRevealedHints((prev) => {
              const next = { ...prev };
              if (displayText || displayMedia)
                next[resolvedIdx] = {
                  text: displayText || undefined,
                  mediaUrl: displayMedia || undefined,
                };
              else delete next[resolvedIdx];
              return next;
            });
          } else {
            const idx = activeClueIdxRef.current;
            if (idx !== null && canSee) {
              setRevealedHints((prev) => ({
                ...prev,
                [idx]: {
                  text: displayText || undefined,
                  mediaUrl: displayMedia || undefined,
                },
              }));
            }
          }
          break;
        }
        case "hide_hint": {
          setHideQuestionContent(true);
          const explicitIdx = Number(msg.clue_index);
          const idx =
            Number.isInteger(explicitIdx) &&
            explicitIdx >= 0 &&
            explicitIdx < CLUE_COUNT
              ? explicitIdx
              : activeClueIdxRef.current;
          if (idx !== null) {
            activeClueIdxRef.current = idx;
            setRevealedHints((prev) => {
              if (!(idx! in prev)) return prev;
              const next = { ...prev };
              delete next[idx!];
              return next;
            });
          }
          break;
        }
        case "player_score_updated":
          applyScoreUpdate(msg);
          break;
        case "clear_answers":
          setPlayers((prev) =>
            prev.map((p) => ({
              ...p,
              playerLastAnswer: undefined,
              playerTimestamp: undefined,
              playerHasBuzzed: undefined,
            })),
          );
          setTimerHasStarted(false);
          setQuestionAnswer("");
          setKeyword("");
          setShowAnswers(false);
          break;
        case "keyword_locked":
          setIsKeywordLocked(true);
          break;
        case "keyword_clues_locked":
          setIsKeywordCluesLocked(true);
          break;
        case "reveal_keyword_answer": {
          const answer = msg.answer ?? null;
          setKeywordAnswer(answer);
          if (answer)
            setKeywordBanner(msg.keyword_banner || buildKeywordBanner(answer));
          break;
        }
        case "send_keyword_info": {
          if (typeof msg.banner === "string" && msg.banner)
            setKeywordBanner(msg.banner);
          break;
        }
        case "keyword_submit": {
          const { user_code, keyword_text, clues_opened } = msg;
          if (user_code) {
            setKeywordSubmittedCodes((prev) => new Set([...prev, user_code]));
            setPlayers((prev) =>
              prev.map((p) =>
                p.playerCode === user_code
                  ? {
                      ...p,
                      playerHasSubmittedKeyword: true,
                      playerKeywordCluesOpened:
                        typeof clues_opened === "number"
                          ? clues_opened
                          : p.playerKeywordCluesOpened,
                    }
                  : p,
              ),
            );
            if (user_code === playerCode) {
              setHasSubmittedKeyword(true);
              if (typeof keyword_text === "string" && keyword_text)
                setKeyword(keyword_text);
            }
          }
          break;
        }
        case "send_keyword_answers": {
          const answers = msg.answers ?? [];
          setPlayers((prev) =>
            prev.map((p) => {
              const a = answers.find(
                (x: any) => String(x.user_code) === p.playerCode,
              );
              return a
                ? {
                    ...p,
                    playerLastAnswer: a.content,
                    playerKeywordCluesOpened:
                      typeof a.clues_opened === "number"
                        ? a.clues_opened
                        : p.playerKeywordCluesOpened,
                  }
                : p;
            }),
          );
          setKeywordSubmittedCodes(new Set());
          break;
        }
        case "send_answers_to_players": {
          const answers = msg.answers ?? [];
          setPlayers((prev) =>
            prev.map((p) => {
              const ans = answers.find(
                (a: any) => String(a.user_code) === p.playerCode,
              );
              return ans
                ? {
                    ...p,
                    playerLastAnswer: ans.content,
                    playerTimestamp: ans.timestamp || p.playerTimestamp,
                  }
                : p;
            }),
          );
          setShowAnswers(true);
          break;
        }
      }
    });
  }, [
    lastMessage,
    playerCode,
    setPlayers,
    startSynced,
    applyWsMessage,
    applyPlayersInfo,
    applyScoreUpdate,
    resetGameState,
  ]);

  const handleSubmitQuestionAnswer = useCallback(async () => {
    const trimmed = questionAnswer.trim();
    if (!trimmed || !isConnected || !currentQuestion.questionCode) return;
    const elapsed = getElapsedSeconds();
    const ts = Math.max(0, Math.min(timeLimit, elapsed));
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
    } catch {}
    setQuestionAnswer("");
  }, [
    questionAnswer,
    isConnected,
    currentQuestion.questionCode,
    getElapsedSeconds,
    timeLimit,
    playerCode,
    matchCode,
    sendMessage,
    setPlayers,
  ]);

  const handleSubmitKeyword = useCallback(() => {
    if (
      !keyword.trim() ||
      hasSubmittedKeyword ||
      isKeywordLocked ||
      !currentQuestion.questionCode
    )
      return;
    setKeywordToConfirm(keyword.trim());
    setShowKeywordConfirm(true);
  }, [
    keyword,
    hasSubmittedKeyword,
    isKeywordLocked,
    currentQuestion.questionCode,
  ]);

  const handleConfirmKeyword = useCallback(async () => {
    const trimmed = keywordToConfirm.trim();
    setShowKeywordConfirm(false);
    if (!trimmed || !currentQuestion.questionCode) return;
    try {
      await submitAnswer({
        user_code: playerCode,
        match_code: matchCode,
        question_code: currentQuestion.questionCode,
        answer_text: trimmed,
        has_buzzed: false,
      });
    } catch {}
    const cluesOpened = isKeywordCluesLocked
      ? CLUE_COUNT
      : clueStates.filter((s) => s !== "idle").length;
    await sendMessage({
      type: "keyword_submit",
      user_code: playerCode,
      keyword_text: trimmed,
      clues_opened: cluesOpened,
    });
    setHasSubmittedKeyword(true);
    setKeywordSubmittedCodes((prev) => new Set([...prev, playerCode]));
    setPlayers((prev) =>
      prev.map((p) =>
        p.playerCode === playerCode
          ? { ...p, playerKeywordCluesOpened: cluesOpened }
          : p,
      ),
    );
    setKeyword("");
  }, [
    clueStates,
    currentQuestion.questionCode,
    isKeywordCluesLocked,
    keywordToConfirm,
    matchCode,
    playerCode,
    sendMessage,
    setPlayers,
  ]);

  const isTimerExpired = timeLimit > 0 && timer === 0;
  const isQuestionAnswerDisabled =
    !isConnected ||
    hasSubmittedKeyword ||
    !currentQuestion.questionCode ||
    !timerHasStarted ||
    isTimerExpired ||
    isKeywordPhase;
  const isKeywordInputDisabled =
    !isConnected ||
    hasSubmittedKeyword ||
    isKeywordLocked ||
    (isKeywordPhase && isTimerExpired) ||
    !currentQuestion.questionCode;

  const displayPlayers = players.map((p) => {
    const withKeyword = keywordSubmittedCodes.has(p.playerCode)
      ? { ...p, playerHasSubmittedKeyword: true }
      : p;
    if (p.playerCode !== playerCode && !showAnswers)
      return {
        ...withKeyword,
        playerLastAnswer: undefined,
        playerTimestamp: undefined,
      };
    return withKeyword;
  });

  const PlayerClueCard: React.FC<{
    index: number;
    state: ClueState;
    hintContent?: RevealedHint;
  }> = ({ index, state, hintContent }) => {
    const styles: Record<ClueState, string> = {
      idle: "bg-primary/40 border-primary text-foreground",
      active:
        "bg-primary border-brand text-foreground shadow-lg ring-2 ring-brand",
      used: "bg-primary/70 border-primary text-foreground",
    };
    const showHint =
      (state === "active" || state === "used") &&
      !!(hintContent?.text || hintContent?.mediaUrl);
    return (
      <div
        className={`flex-1 h-16 sm:h-20 lg:h-28 xl:h-36 flex items-center justify-center rounded-xl font-bold transition-all duration-200 select-none border-2 ${styles[state]}`}
      >
        {showHint ? (
          <div className="flex items-center justify-center w-full h-full p-2">
            {hintContent!.mediaUrl ? (
              <RenderMedia mediaUrl={hintContent!.mediaUrl} />
            ) : (
              <span className="text-sm sm:text-base lg:text-lg xl:text-xl font-bold text-center leading-snug">
                {hintContent!.text}
              </span>
            )}
          </div>
        ) : (
          <span className="font-display text-2xl sm:text-3xl lg:text-[40pt] xl:text-[50pt]">
            {index}
          </span>
        )}
      </div>
    );
  };

  const clueGrid = (
    <div className="flex flex-col gap-2 sm:gap-3 w-full mb-2 sm:mb-3 px-1 sm:px-3">
      <div className="w-full bg-primary/40 border-2 border-primary rounded-xl px-2 sm:px-4 py-1.5 sm:py-2 text-center font-display text-lg sm:text-2xl lg:text-3xl font-bold text-foreground uppercase shadow">
        {keywordAnswer || keywordBanner}
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 w-full">
        {Array.from({ length: CLUE_COUNT }, (_, i) => (
          <PlayerClueCard
            key={i}
            index={i + 1}
            state={clueStates[i]}
            hintContent={revealedHints[i]}
          />
        ))}
      </div>
    </div>
  );

  return (
    <PBasePageLayout players={displayPlayers} currentPlayerCode={playerCode}>
      {clueGrid}
      <PQuestionBoard
        title="GIẢI MÃ"
        question={
          isKeywordPhase
            ? {
                ...currentQuestion,
                questionText: keywordBanner,
                questionMediaURL: undefined,
              }
            : currentQuestion
        }
        timerDuration={timer}
        boardHeightClass="h-[35vh] sm:h-[40vh] lg:h-[45vh]"
        controls={{ variant: "numbers", count: 0 }}
        hideContent={hideQuestionContent || isKeywordPhase}
      />
      <PAnswerBox
        answer={questionAnswer}
        setAnswer={setQuestionAnswer}
        isDisabled={isQuestionAnswerDisabled}
        onSubmit={handleSubmitQuestionAnswer}
        placeholderString={
          isQuestionAnswerDisabled
            ? "Không thể nhập câu trả lời"
            : "Nhập câu trả lời và nhấn Enter"
        }
      />
      <PAnswerBox
        answer={keyword}
        setAnswer={setKeyword}
        isDisabled={isKeywordInputDisabled}
        onSubmit={handleSubmitKeyword}
        placeholderString={
          isKeywordInputDisabled
            ? "Không thể nhập từ khoá"
            : "Nhập từ khoá và nhấn Enter"
        }
        showKeyIcon
      />
      <AlertDialog
        open={showKeywordConfirm}
        onOpenChange={(v) => {
          if (!v) setShowKeywordConfirm(false);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận nộp Từ khoá</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn chỉ được nộp <strong>1 lần</strong>. Không thể thay đổi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-center text-lg font-bold text-foreground">
            &quot;{keywordToConfirm}&quot;
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted font-bold text-foreground hover:bg-muted/80">
              HỦY
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmKeyword()}
              className="bg-primary font-bold text-primary-foreground hover:bg-primary/90"
            >
              XÁC NHẬN
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PBasePageLayout>
  );
};
