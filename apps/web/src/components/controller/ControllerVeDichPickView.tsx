import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle, RotateCcw, RefreshCw } from "lucide-react";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { createLogger } from "@/utils/logger";
import {
  getMatchCode,
  matchStoragePrefixes,
  readMatchJson,
  readMatchString,
  removeMatchKey,
  writeMatchJson,
  writeMatchString,
} from "@/utils/storage";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import type { RawPlayer, RawScore } from "@/utils/playerHelpers";
import type { QuestionApiPayload } from "@/utils/questionMapper";
import {
  compareVeDichCodes,
  generateVeDichPlaceholderCodes,
  getVeDichMeta,
} from "@/utils/veDichGrid";
import { VeDichRound, getVeDichRoundLabel } from "@/types/veDich";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { ApiError, apiGet, apiGetOrNull } from "@/api/client";

import CVeDichPickLayout from "@/pages/controller/CVeDichPickLayout";
import CPlayerBar from "@/components/controller/CPlayerBar";
import CControlButton from "@/components/controller/CControlButton";

const logger = createLogger("ControllerVeDichPickView");

export const ControllerVeDichPickView = () => {
  const { matchCode: paramMatchCode } = useParams<{ matchCode: string }>();
  const currentMatchCode = getMatchCode() || paramMatchCode || "";
  const { lastMessage, sendMessage } = useGameWebSocket();
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentMatchCode) navigate("/operator/controller/overview");
  }, [currentMatchCode, navigate]);

  const currentPath = window.location.pathname;
  const isChung =
    currentPath.includes("/vdc/pick") && !currentPath.includes("/vdr/");
  const round = isChung ? VeDichRound.CHUNG : VeDichRound.RIENG;
  const roundTitle = getVeDichRoundLabel(round);

  const [players, setPlayers] = useState<PlayerStatus[]>([]);
  const activePlayers = players.filter((player) => !player.playerAfk);
  const [selectedPlayerCode, setSelectedPlayerCode] = useState<string | null>(
    null,
  );
  const [questions, setQuestions] = useState<Question[]>([]);
  const [usedQuestionCodes, setUsedQuestionCodes] = useState<string[]>([]);
  const usedQuestionCodesRef = useRef<string[]>([]);
  useEffect(() => {
    usedQuestionCodesRef.current = usedQuestionCodes;
  }, [usedQuestionCodes]);
  const [selectedQuestionCodes, setSelectedQuestionCodes] = useState<string[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [placeholderQuestions, setPlaceholderQuestions] = useState<Question[]>(
    [],
  );

  const requiredCount = isChung ? activePlayers.length : round;
  const questionCategories = questions.map(
    (q, idx) => getVeDichMeta(q.questionCode, idx).category,
  );
  const questionPoints = questions.map(
    (q, idx) => getVeDichMeta(q.questionCode, idx).points,
  );

  const toggleQuestionSelection = useCallback(
    (questionCode: string) => {
      if (!isChung && !selectedPlayerCode) {
        setErrorMessage("Vui lòng chọn thí sinh tham gia lượt thi trước");
        return;
      }
      setSelectedQuestionCodes((prev) => {
        const isSelected = prev.includes(questionCode);
        if (isSelected) return prev.filter((code) => code !== questionCode);
        if (prev.length < requiredCount) return [...prev, questionCode];
        return prev;
      });
    },
    [requiredCount, isChung, selectedPlayerCode],
  );

  useEffect(() => {
    if (!currentMatchCode) return;
    const allCodes = questions.map((q) => q.questionCode);
    sendMessage({
      type: "vd_selection_update",
      match_code: currentMatchCode,
      round: isChung ? "chung" : "rieng",
      selected_question_codes: selectedQuestionCodes,
      all_question_codes: allCodes,
      used_question_codes: usedQuestionCodes,
    });
    if (allCodes.length > 0)
      writeMatchJson(
        matchStoragePrefixes.pickAllCodes,
        currentMatchCode,
        allCodes,
      );
    if (selectedQuestionCodes.length > 0)
      writeMatchJson(
        matchStoragePrefixes.pickSelected,
        currentMatchCode,
        selectedQuestionCodes,
      );
    else removeMatchKey(matchStoragePrefixes.pickSelected, currentMatchCode);
  }, [
    selectedQuestionCodes,
    questions,
    currentMatchCode,
    isChung,
    sendMessage,
    usedQuestionCodes,
  ]);

  useEffect(() => {
    if (!currentMatchCode || isChung) return;
    sendMessage({
      type: "blocked_buzz",
      user_code: selectedPlayerCode ?? null,
      match_code: currentMatchCode,
    });
    writeMatchString(
      matchStoragePrefixes.riengSelectedPlayer,
      currentMatchCode,
      selectedPlayerCode ?? "",
    );
  }, [selectedPlayerCode, currentMatchCode, isChung, sendMessage]);

  const toggleSelectedPlayer = useCallback((playerCode: string) => {
    setSelectedPlayerCode((prev) => (prev === playerCode ? null : playerCode));
  }, []);

  const loadPlayersState = useCallback(async () => {
    if (!currentMatchCode) return;
    try {
      const playersJson = await apiGetOrNull<{ players?: RawPlayer[] }>(
        `/matches/${currentMatchCode}/players`,
      );
      const playersList = playersJson?.data?.players ?? [];
      let scoreList: any[] = [];
      try {
        const scoreJson = await apiGetOrNull<{ scoreboard?: RawScore[] }>(
          `/scoreboard/${currentMatchCode}`,
        );
        scoreList = scoreJson?.data?.scoreboard ?? [];
      } catch {}
      const profiles = playersList.map((entry: any) => ({
        user_code: entry.user_code,
        user_name: entry.user_name ?? "",
      }));
      setPlayers((prev) =>
        buildPlayersSnapshot(playersList, scoreList, profiles, prev),
      );
      const mergedPlayers = playersList.map((p: any) => {
        const userCode = String(p?.user_code ?? "");
        const profile =
          profiles.find((pr: any) => String(pr?.user_code) === userCode) ?? {};
        const scoreEntry =
          scoreList.find((s: any) => String(s?.user_code) === userCode) ?? {};
        return {
          user_code: userCode,
          user_name:
            (profile as any)?.user_name ??
            p?.user_name ??
            (scoreEntry as any)?.user_name ??
            "",
          cumulative_score:
            (scoreEntry as any)?.cumulative_score ??
            (scoreEntry as any)?.total_score ??
            0,
        };
      });
      sendMessage({ type: "send_players_info", players: mergedPlayers });
    } catch (err) {
      logger.error("Failed to load players:", err);
    }
  }, [currentMatchCode, sendMessage]);

  const sendSpecificRoundSnapshot = useCallback(async () => {
    if (!currentMatchCode) return;
    const allCodes = questions.map((q) => q.questionCode);
    await sendMessage({
      type: "vd_selection_update",
      match_code: currentMatchCode,
      round: isChung ? "chung" : "rieng",
      selected_question_codes: selectedQuestionCodes,
      all_question_codes: allCodes,
      used_question_codes: usedQuestionCodes,
    });
    if (selectedQuestionCodes.length > 0) {
      const payload: any = {
        type: "vd_questions_selected",
        match_code: currentMatchCode,
        round: isChung ? "chung" : "rieng",
        selected_question_codes: selectedQuestionCodes,
        all_question_codes: allCodes,
        question_metadata: selectedQuestionCodes.map((code) => {
          const idx = allCodes.findIndex((c) => c === code);
          return {
            code,
            category:
              questionCategories[idx] ?? `Category ${Math.floor(idx / 4) + 1}`,
            points: questionPoints[idx] ?? 0,
          };
        }),
        timestamp: Date.now(),
      };
      if (!isChung) payload.selected_player_code = selectedPlayerCode ?? null;
      await sendMessage(payload);
    }
  }, [
    currentMatchCode,
    isChung,
    questionCategories,
    questionPoints,
    questions,
    selectedPlayerCode,
    selectedQuestionCodes,
    sendMessage,
    usedQuestionCodes,
  ]);

  const sendRoundSnapshot = useCallback(async () => {
    await loadPlayersState();
    await sendSpecificRoundSnapshot();
  }, [loadPlayersState, sendSpecificRoundSnapshot]);

  const handleEditScore = useCallback(
    (playerCode: string, newScore: number) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.playerCode === playerCode ? { ...p, playerScore: newScore } : p,
        ),
      );
      void loadPlayersState();
    },
    [loadPlayersState],
  );

  useEffect(() => {
    loadPlayersState();
  }, [loadPlayersState]);

  useEffect(() => {
    if (!currentMatchCode) return;
    const stored = readMatchString(
      matchStoragePrefixes.riengSelectedPlayer,
      currentMatchCode,
    );
    if (stored) setSelectedPlayerCode(stored || null);
  }, [currentMatchCode]);

  useEffect(() => {
    const oc = currentMatchCode.toUpperCase().match(/^OC(\d+)/)?.[0] ?? "OC3";
    const allPlaceholderCodes = generateVeDichPlaceholderCodes(oc);
    const placeholders: Question[] = allPlaceholderCodes.map((code) => ({
      questionCode: code,
      questionText: "",
      questionAnswer: "",
      questionExplanation: "",
      questionMediaURL: undefined,
    }));
    setPlaceholderQuestions(placeholders);
    if (currentMatchCode) {
      sendMessage({
        type: "vd_selection_update",
        match_code: currentMatchCode,
        round: isChung ? "chung" : "rieng",
        selected_question_codes: [],
        all_question_codes: allPlaceholderCodes,
        used_question_codes: [],
      });
      writeMatchJson(
        matchStoragePrefixes.pickAllCodes,
        currentMatchCode,
        allPlaceholderCodes,
      );
    }
  }, [currentMatchCode, isChung, sendMessage]);

  useEffect(() => {
    const fetchQuestions = async () => {
      if (!currentMatchCode) {
        setErrorMessage("Match code missing");
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setErrorMessage("");
        const result = await apiGet<
          QuestionApiPayload | QuestionApiPayload[]
        >(`/questions/?match_code=${encodeURIComponent(currentMatchCode)}`).catch(
          (error: unknown) => {
            // Giữ nguyên thông báo `Failed: <status>` của bản fetch thô (chỉ nằm trong log).
            if (error instanceof ApiError && error.status > 0)
              throw new Error(`Failed: ${error.status}`);
            throw error;
          },
        );
        const raw = Array.isArray(result.data)
          ? result.data
          : [result.data].filter(Boolean);
        const veDichRaw = raw.filter((q: any) =>
          /^OC\d+_Q_VD/.test(String(q.question_code ?? "")),
        );
        const mapped: Question[] = veDichRaw.map((q: any) => ({
          questionCode: q.question_code,
          questionText: q.content,
          questionAnswer: q.answer,
          questionExplanation: q.explanation ?? "",
          questionMediaURL: q.media_url ?? undefined,
        }));
        const used = veDichRaw
          .filter((q: any) => q.is_used === true)
          .map((q: any) => q.question_code);
        const storedUsed = readMatchJson<string[]>(
          matchStoragePrefixes.usedCodes,
          currentMatchCode,
          [],
        );
        if (storedUsed.length > 0) {
          setUsedQuestionCodes([...new Set([...used, ...storedUsed])]);
        } else {
          setUsedQuestionCodes(used);
        }
        mapped.sort((a, b) =>
          compareVeDichCodes(a.questionCode, b.questionCode),
        );
        const deduped = mapped.filter(
          (q, i, arr) =>
            arr.findIndex((q2) => q2.questionCode === q.questionCode) === i,
        );
        if (deduped.length === 0)
          setErrorMessage("Không tìm thấy câu hỏi Về Đích cho trận đấu này");
        setQuestions(deduped);
        const allCodes = deduped.map((q) => q.questionCode);
        if (currentMatchCode && allCodes.length > 0)
          writeMatchJson(
            matchStoragePrefixes.pickAllCodes,
            currentMatchCode,
            allCodes,
          );
        sendMessage({
          type: "vd_selection_update",
          match_code: currentMatchCode,
          round: isChung ? "chung" : "rieng",
          selected_question_codes: [],
          all_question_codes: allCodes,
          used_question_codes: usedQuestionCodesRef.current,
        });
      } catch (err) {
        logger.error("Failed to fetch questions:", err);
        setErrorMessage("Lỗi khi tải câu hỏi");
      } finally {
        setIsLoading(false);
      }
    };
    void fetchQuestions();
  }, [currentMatchCode, isChung, sendMessage]);

  useEffect(() => {
    if (!lastMessage) return;
    startTransition(() => {
      if (Array.isArray(lastMessage)) {
        const snapshot = buildPlayersSnapshot(lastMessage, [], [], players);
        setPlayers(snapshot);
      }
    });
  }, [lastMessage, players]);

  const handleConfirmSelection = useCallback(async () => {
    if (requiredCount === 0) {
      setErrorMessage("Chưa tải được danh sách thí sinh");
      return;
    }
    if (!isChung && !selectedPlayerCode) {
      setErrorMessage("Vui lòng chọn thí sinh tham gia lượt thi trước");
      return;
    }
    if (selectedQuestionCodes.length !== requiredCount) {
      setErrorMessage(`Vui lòng chọn đủ ${requiredCount} câu hỏi`);
      return;
    }
    try {
      setErrorMessage("");
      setSuccessMessage("");
      setUsedQuestionCodes((prev) => [
        ...new Set([...prev, ...selectedQuestionCodes]),
      ]);
      if (currentMatchCode) {
        const existing = readMatchJson<string[]>(
          matchStoragePrefixes.usedCodes,
          currentMatchCode,
          [],
        );
        writeMatchJson(matchStoragePrefixes.usedCodes, currentMatchCode, [
          ...new Set([...existing, ...selectedQuestionCodes]),
        ]);
      }
      const allCodes = questions.map((q) => q.questionCode);
      const payload: any = {
        type: "vd_questions_selected",
        match_code: currentMatchCode,
        round: isChung ? "chung" : "rieng",
        selected_question_codes: selectedQuestionCodes,
        all_question_codes: allCodes,
        question_metadata: selectedQuestionCodes.map((code) => {
          const idx = allCodes.findIndex((c) => c === code);
          return {
            code,
            category:
              questionCategories[idx] ?? `Category ${Math.floor(idx / 4) + 1}`,
            points: questionPoints[idx] ?? 0,
          };
        }),
        timestamp: Date.now(),
      };
      if (!isChung) payload.selected_player_code = selectedPlayerCode ?? null;
      sendMessage(payload);
      void sendRoundSnapshot();
      sendMessage({ type: "navigate", user_code: "", path: "/player/vdc" });
      if (currentMatchCode) {
        writeMatchJson(
          isChung
            ? matchStoragePrefixes.chungCodes
            : matchStoragePrefixes.riengCodes,
          currentMatchCode,
          selectedQuestionCodes,
        );
        if (!isChung)
          writeMatchString(
            matchStoragePrefixes.riengSelectedPlayer,
            currentMatchCode,
            selectedPlayerCode ?? "",
          );
      }
      setSuccessMessage(
        `Đã chọn ${requiredCount} câu hỏi. Chuyển đến vòng thi...`,
      );
      setTimeout(() => {
        const dest = isChung
          ? `/operator/controller/vdc/${currentMatchCode}`
          : `/operator/controller/vdr/${currentMatchCode}`;
        navigate(dest);
      }, 1500);
    } catch (err) {
      logger.error("Failed to confirm selection:", err);
      setErrorMessage("Lỗi khi xác nhận câu hỏi");
    }
  }, [
    selectedQuestionCodes,
    questions,
    requiredCount,
    currentMatchCode,
    isChung,
    sendMessage,
    navigate,
    selectedPlayerCode,
    questionCategories,
    questionPoints,
    sendRoundSnapshot,
  ]);

  const handleResetSelection = useCallback(() => {
    setSelectedQuestionCodes([]);
    setErrorMessage("");
    setSuccessMessage("");
  }, []);

  const handleResetUsedQuestions = useCallback(() => {
    if (!currentMatchCode) return;
    setUsedQuestionCodes([]);
    removeMatchKey(matchStoragePrefixes.usedCodes, currentMatchCode);
    removeMatchKey(matchStoragePrefixes.chungCodes, currentMatchCode);
    removeMatchKey(matchStoragePrefixes.riengCodes, currentMatchCode);
    sendMessage({
      type: "vd_selection_update",
      match_code: currentMatchCode,
      round: isChung ? "chung" : "rieng",
      selected_question_codes: selectedQuestionCodes,
      all_question_codes: questions.map((q) => q.questionCode),
      silent: true,
    });
    setSuccessMessage(
      "Đã reset trạng thái câu hỏi — tất cả câu có thể chọn lại",
    );
  }, [
    currentMatchCode,
    questions,
    selectedQuestionCodes,
    isChung,
    sendMessage,
  ]);

  return (
    <CVeDichPickLayout
      title={roundTitle}
      maxQuestions={requiredCount}
      questions={questions.length > 0 ? questions : placeholderQuestions}
      categories={
        questionCategories.length > 0
          ? questionCategories
          : placeholderQuestions.map(
              (q, idx) => getVeDichMeta(q.questionCode, idx).category,
            )
      }
      points={
        questionPoints.length > 0
          ? questionPoints
          : placeholderQuestions.map(
              (q, idx) => getVeDichMeta(q.questionCode, idx).points,
            )
      }
      selectedQuestionCodes={selectedQuestionCodes}
      onQuestionSelect={toggleQuestionSelection}
      disabledQuestionCodes={usedQuestionCodes}
      canSelectQuestions={!isChung ? !!selectedPlayerCode : true}
      topControlButtons={
        <>
          <CControlButton
            onClick={handleConfirmSelection}
            disabled={
              selectedQuestionCodes.length !== requiredCount ||
              requiredCount === 0 ||
              isLoading
            }
          >
            <CheckCircle size={20} />
            <span className="ml-2 font-bold">XÁC NHẬN</span>
          </CControlButton>
          <CControlButton onClick={handleResetSelection}>
            <RotateCcw size={20} />
            <span className="ml-2 font-bold">CHỌN LẠI</span>
          </CControlButton>
          <CControlButton onClick={handleResetUsedQuestions}>
            <RefreshCw size={18} />
            <span className="ml-2 font-bold">RESET</span>
          </CControlButton>
        </>
      }
      bottomActionButtons={
        <>
          {isLoading && questions.length === 0 && (
            <p className="text-brand font-semibold">Đang tải câu hỏi...</p>
          )}
          {questions.length > 0 && (
            <p className="text-success font-semibold">
              ✓ Đã tải {questions.length} câu hỏi
            </p>
          )}
        </>
      }
      statusMessages={
        <>
          {errorMessage && (
            <div className="text-brand font-semibold text-center">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="text-brand font-semibold text-center">
              {successMessage}
            </div>
          )}
        </>
      }
      renderPlayerList={() =>
        activePlayers.map((player) => (
          <CPlayerBar
            key={player.playerCode}
            player={player}
            isActive={selectedPlayerCode === player.playerCode}
            isCurrent={!isChung && selectedPlayerCode === player.playerCode}
            onClick={
              isChung
                ? undefined
                : () => toggleSelectedPlayer(player.playerCode)
            }
            disabled={false}
            onEditScore={handleEditScore}
            matchCode={currentMatchCode}
            sendMessage={sendMessage}
          />
        ))
      }
    />
  );
};
