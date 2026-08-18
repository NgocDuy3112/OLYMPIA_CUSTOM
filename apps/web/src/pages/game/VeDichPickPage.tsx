/**
 * VeDichPickPage — Unified page for question selection in Về Đích rounds.
 *
 * Admin: full question selection interface with player management.
 * MC: read-only audience view of selected questions.
 * Player: display of selected questions grid.
 */
import { startTransition, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle, RotateCcw, RefreshCw } from "lucide-react";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useRoleSession } from "@/hooks/useRoleSession";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import {
  compareVeDichCodes,
  generateVeDichPlaceholderCodes,
  getVeDichMeta,
} from "@/utils/veDichGrid";
import { VeDichRound, getVeDichRoundLabel } from "@/types/veDich";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";

import AVeDichPickLayout from "@/pages/admin/AVeDichPickLayout";
import APlayerBar from "@/components/admin/APlayerBar";
import AControlButton from "@/components/admin/AControlButton";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { VeDichPickAudiencePage } from "@/components/shared/VeDichPickAudiencePage";
import { useAudiencePlayers } from "@/hooks/useAudiencePlayers";

const logger = createLogger("VeDichPickPage");
const CATEGORIES = [
  "TOÁN - TIN - THỐNG KÊ",
  "TỰ NHIÊN - SỰ SỐNG",
  "KINH TẾ - XÃ HỘI",
  "VĂN HỌC - NGHỆ THUẬT",
  "VĂN HÓA - THỂ THAO",
  "KIẾN THỨC TỔNG HỢP",
];

// ─── Admin View ─────────────────────────────────────────────────────────────
const AdminVeDichPickView = () => {
  const { matchCode: paramMatchCode } = useParams<{ matchCode: string }>();
  const currentMatchCode =
    localStorage.getItem("matchCode") || paramMatchCode || "";
  const { lastMessage, sendMessage } = useGameWebSocket();
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentMatchCode) navigate("/admin/manage");
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
      localStorage.setItem(
        `vd_pick_all_codes_${currentMatchCode}`,
        JSON.stringify(allCodes),
      );
    if (selectedQuestionCodes.length > 0)
      localStorage.setItem(
        `vd_pick_selected_${currentMatchCode}`,
        JSON.stringify(selectedQuestionCodes),
      );
    else localStorage.removeItem(`vd_pick_selected_${currentMatchCode}`);
  }, [
    selectedQuestionCodes,
    questions,
    currentMatchCode,
    isChung,
    sendMessage,
  ]);

  useEffect(() => {
    if (!currentMatchCode || isChung) return;
    sendMessage({
      type: "blocked_buzz",
      user_code: selectedPlayerCode ?? null,
      match_code: currentMatchCode,
    });
    try {
      localStorage.setItem(
        `vd_rieng_selected_player_${currentMatchCode}`,
        selectedPlayerCode ?? "",
      );
    } catch {}
  }, [selectedPlayerCode, currentMatchCode, isChung, sendMessage]);

  const toggleSelectedPlayer = useCallback((playerCode: string) => {
    setSelectedPlayerCode((prev) => (prev === playerCode ? null : playerCode));
  }, []);

  const loadPlayersState = useCallback(async () => {
    if (!currentMatchCode) return;
    try {
      const playersRes = await fetch(
        `${API_BASE_URL}/matches/${currentMatchCode}/players`,
        { credentials: "include" },
      );
      const playersJson = await playersRes.json();
      const playersList = playersJson.data?.players ?? [];
      let scoreList: any[] = [];
      try {
        const scoreRes = await fetch(
          `${API_BASE_URL}/scoreboard/${currentMatchCode}`,
          { credentials: "include" },
        );
        const scoreJson = await scoreRes.json();
        scoreList = scoreJson.data?.scoreboard ?? [];
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
    try {
      const stored = localStorage.getItem(
        `vd_rieng_selected_player_${currentMatchCode}`,
      );
      if (stored) setSelectedPlayerCode(stored || null);
    } catch {}
  }, [currentMatchCode]);

  useEffect(() => {
    const allPlaceholderCodes = generateVeDichPlaceholderCodes();
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
      try {
        localStorage.setItem(
          `vd_pick_all_codes_${currentMatchCode}`,
          JSON.stringify(allPlaceholderCodes),
        );
      } catch {}
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
        const res = await fetch(
          `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const result = await res.json();
        const raw = Array.isArray(result.data)
          ? result.data
          : [result.data].filter(Boolean);
        const veDichRaw = raw.filter(
          (q: any) =>
            q.question_code?.includes("_VD_") ||
            q.question_code?.startsWith("OC3_Q_VD"),
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
        try {
          const storedUsed = localStorage.getItem(
            `vd_used_codes_${currentMatchCode}`,
          );
          if (storedUsed) {
            const usedCodes = JSON.parse(storedUsed) as string[];
            setUsedQuestionCodes([...new Set([...used, ...usedCodes])]);
          } else {
            setUsedQuestionCodes(used);
          }
        } catch {
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
          try {
            localStorage.setItem(
              `vd_pick_all_codes_${currentMatchCode}`,
              JSON.stringify(allCodes),
            );
          } catch {}
        sendMessage({
          type: "vd_selection_update",
          match_code: currentMatchCode,
          round: isChung ? "chung" : "rieng",
          selected_question_codes: [],
          all_question_codes: allCodes,
          used_question_codes: usedQuestionCodes,
        });
      } catch (err) {
        logger.error("Failed to fetch questions:", err);
        setErrorMessage("Lỗi khi tải câu hỏi");
      } finally {
        setIsLoading(false);
      }
    };
    void fetchQuestions();
  }, [currentMatchCode]);

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
        try {
          const existing = JSON.parse(
            localStorage.getItem(`vd_used_codes_${currentMatchCode}`) ?? "[]",
          ) as string[];
          localStorage.setItem(
            `vd_used_codes_${currentMatchCode}`,
            JSON.stringify([
              ...new Set([...existing, ...selectedQuestionCodes]),
            ]),
          );
        } catch {}
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
        const codesKey = isChung
          ? `vd_chung_codes_${currentMatchCode}`
          : `vd_rieng_codes_${currentMatchCode}`;
        localStorage.setItem(codesKey, JSON.stringify(selectedQuestionCodes));
        if (!isChung)
          localStorage.setItem(
            `vd_rieng_selected_player_${currentMatchCode}`,
            selectedPlayerCode ?? "",
          );
      }
      setSuccessMessage(
        `Đã chọn ${requiredCount} câu hỏi. Chuyển đến vòng thi...`,
      );
      setTimeout(() => {
        const dest = isChung
          ? `/admin/vdc/${currentMatchCode}`
          : `/admin/vdr/${currentMatchCode}`;
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
    try {
      localStorage.removeItem(`vd_used_codes_${currentMatchCode}`);
      localStorage.removeItem(`vd_chung_codes_${currentMatchCode}`);
      localStorage.removeItem(`vd_rieng_codes_${currentMatchCode}`);
    } catch {}
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
    <AVeDichPickLayout
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
          <AControlButton
            onClick={handleConfirmSelection}
            disabled={
              selectedQuestionCodes.length !== requiredCount ||
              requiredCount === 0 ||
              isLoading
            }
          >
            <CheckCircle size={20} />
            <span className="ml-2 font-bold">XÁC NHẬN</span>
          </AControlButton>
          <AControlButton onClick={handleResetSelection}>
            <RotateCcw size={20} />
            <span className="ml-2 font-bold">CHỌN LẠI</span>
          </AControlButton>
          <AControlButton onClick={handleResetUsedQuestions}>
            <RefreshCw size={18} />
            <span className="ml-2 font-bold">RESET</span>
          </AControlButton>
        </>
      }
      bottomActionButtons={
        <>
          {isLoading && questions.length === 0 && (
            <p className="text-blue-600 font-semibold">Đang tải câu hỏi...</p>
          )}
          {questions.length > 0 && (
            <p className="text-green-600 font-semibold">
              ✓ Đã tải {questions.length} câu hỏi
            </p>
          )}
        </>
      }
      statusMessages={
        <>
          {errorMessage && (
            <div className="text-blue-600 font-semibold text-center">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="text-blue-600 font-semibold text-center">
              {successMessage}
            </div>
          )}
        </>
      }
      renderPlayerList={() =>
        activePlayers.map((player) => (
          <APlayerBar
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

// ─── MC View ────────────────────────────────────────────────────────────────
const MCVeDichPickView = ({ round }: { round: VeDichRound }) => {
  const { matchCode: routeMatchCode } = useParams<{ matchCode: string }>();
  const { matchCode } = useRoleSession("mc");
  return (
    <VeDichPickAudiencePage
      round={round}
      matchCode={routeMatchCode || matchCode}
      Layout={PBasePageLayout}
    />
  );
};

// ─── Player View ────────────────────────────────────────────────────────────
const PlayerVeDichPickView = ({ round }: { round: VeDichRound }) => {
  const { playerCode: paramPlayerCode, matchCode: paramMatchCode } = useParams<{
    matchCode: string;
    playerCode: string;
  }>();
  const { playerCode: sessionPlayerCode } = useRoleSession("player");
  const playerCode = paramPlayerCode || sessionPlayerCode;
  const { lastMessage } = useGameWebSocket();
  const { players, applyPlayersInfo } = useAudiencePlayers();

  const [allQuestionCodes, setAllQuestionCodes] = useState<string[]>(() => {
    if (!paramMatchCode) return [];
    try {
      const stored = localStorage.getItem(
        `vd_pick_all_codes_${paramMatchCode}`,
      );
      const codes = stored ? JSON.parse(stored) : [];
      return codes.length > 0 ? codes : [];
    } catch {
      return [];
    }
  });
  const [liveSelectedCodes, setLiveSelectedCodes] = useState<string[]>(() => {
    if (!paramMatchCode) return [];
    try {
      return JSON.parse(
        localStorage.getItem(`vd_pick_selected_${paramMatchCode}`) ?? "[]",
      );
    } catch {
      return [];
    }
  });
  const [confirmedCodes, setConfirmedCodes] = useState<string[]>([]);
  const [usedQuestionCodes, setUsedQuestionCodes] = useState<string[]>(() => {
    if (!paramMatchCode) return [];
    try {
      return JSON.parse(
        localStorage.getItem(`vd_used_codes_${paramMatchCode}`) ?? "[]",
      );
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage.message ?? lastMessage;
    queueMicrotask(() => {
      switch (msg?.type) {
        case "send_players_info":
          applyPlayersInfo(msg);
          break;
        case "vd_selection_update": {
          const codes = msg.selected_question_codes ?? [];
          setLiveSelectedCodes(Array.isArray(codes) ? codes : []);
          const allCodes = msg.all_question_codes;
          if (Array.isArray(allCodes) && allCodes.length > 0)
            setAllQuestionCodes(allCodes);
          const usedCodes = msg.used_question_codes;
          if (Array.isArray(usedCodes)) setUsedQuestionCodes(usedCodes);
          break;
        }
        case "vd_questions_selected": {
          const codes = msg.selected_question_codes ?? [];
          const finalCodes = Array.isArray(codes) ? codes : [];
          setConfirmedCodes(finalCodes);
          setLiveSelectedCodes(finalCodes);
          const allCodes2 = msg.all_question_codes;
          if (Array.isArray(allCodes2) && allCodes2.length > 0)
            setAllQuestionCodes(allCodes2);
          setUsedQuestionCodes((prev) => {
            const updated = [...new Set([...prev, ...finalCodes])];
            try {
              localStorage.setItem(
                `vd_used_codes_${paramMatchCode}`,
                JSON.stringify(updated),
              );
            } catch {}
            return updated;
          });
          break;
        }
      }
    });
  }, [applyPlayersInfo, lastMessage, paramMatchCode]);

  const activePlayers = players.filter((player) => !player.playerAfk);
  const maxQuestions =
    round === VeDichRound.CHUNG ? Math.max(activePlayers.length, 1) : round;
  const title = getVeDichRoundLabel(round);
  const displayCodes =
    confirmedCodes.length > 0 ? confirmedCodes : liveSelectedCodes;

  return (
    <PBasePageLayout players={players} currentPlayerCode={playerCode}>
      <div className="p-5 rounded-xl flex flex-col bg-blue-900 border-2 border-blue-600 shadow-xl gap-4 w-full">
        <div className="flex items-center gap-4 pb-1">
          {(() => {
            const parts = title.split(" - ");
            if (parts.length >= 2)
              return (
                <div className="flex flex-col leading-tight shrink-0">
                  <span className="text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase">
                    {parts[0]}
                  </span>
                  <span className="text-2xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase">
                    {parts.slice(1).join(" - ")}
                  </span>
                </div>
              );
            return (
              <span className="text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase shrink-0">
                {title}
              </span>
            );
          })()}
          <div className="flex-1" />
          <div className="flex gap-1">
            {Array.from({ length: maxQuestions }).map((_, i) => {
              const code = displayCodes[i];
              if (!code)
                return (
                  <div key={`slot-empty-${i}`} className="w-55 shrink-0 h-20">
                    <VeDichQuestionCard
                      placeholder
                      category=""
                      points={undefined}
                      disabled
                    />
                  </div>
                );
              const qIndex = allQuestionCodes.indexOf(code);
              const rawCategory = CATEGORIES[Math.floor(qIndex / 4)] || "";
              const point = [20, 30, 40, 50][qIndex % 4] || 0;
              const [catPrimary, catSecondary] = rawCategory
                .split("|")
                .map((s) => s?.trim());
              return (
                <div key={`slot-${code}`} className="w-55 shrink-0 h-20">
                  <VeDichQuestionCard
                    category={catPrimary || rawCategory}
                    subcategory={catSecondary}
                    points={point}
                    isSelected
                    disabled={false}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="border-t border-blue-700" />
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(4, 1fr)",
            gridAutoRows: "minmax(76px, 76px)",
          }}
        >
          {Array.from({ length: 6 * 4 }).map((_, idx) => {
            const questionCode = allQuestionCodes[idx];
            const fallbackCode = `OC3_Q_VD_${Math.floor(idx / 4) + 1}_${(idx % 4) + 1}`;
            const displayCode = questionCode || fallbackCode;
            const rawCategory = CATEGORIES[Math.floor(idx / 4)] || "";
            const point = [20, 30, 40, 50][idx % 4] || 0;
            const [catPrimary, catSecondary] = rawCategory
              .split("|")
              .map((s) => s?.trim());
            const isSelected = displayCodes.includes(displayCode);
            const isUsed = usedQuestionCodes.includes(displayCode);
            return (
              <VeDichQuestionCard
                key={displayCode}
                category={catPrimary || rawCategory}
                subcategory={catSecondary}
                points={point}
                isSelected={isSelected}
                disabled={isUsed}
              />
            );
          })}
        </div>
      </div>
    </PBasePageLayout>
  );
};

// ─── Main Page ──────────────────────────────────────────────────────────────
interface VeDichPickPageProps {
  round: VeDichRound;
}
const VeDichPickPage = ({ round }: VeDichPickPageProps) => {
  const { role } = useGameWebSocket();
  if (role === "admin") return <AdminVeDichPickView />;
  if (role === "mc") return <MCVeDichPickView round={round} />;
  return <PlayerVeDichPickView round={round} />;
};

export default VeDichPickPage;
