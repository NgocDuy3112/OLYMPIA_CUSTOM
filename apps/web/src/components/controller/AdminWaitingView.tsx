import { useCallback, useEffect, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";

import { Play, UserCheck, Trophy, Flag, CheckCircle } from "lucide-react";

import { getMatchCode, setMatchCode } from "@/utils/storage";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";

import { usePlayerTelemetry } from "@/hooks/usePlayerTelemetry";

import { useWaitingState } from "@/hooks/useWaitingState";

import { createLogger } from "@/utils/logger";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { notifyError } from "@/lib/notify";

import { buildPlayersSnapshot } from "@/utils/playerHelpers";

import { buildWaitingBroadcastPlayers, finishMatch, loadWaitingSnapshot } from "@/api/waiting";

import CControlButton from "@/components/controller/CControlButton";

import CPlayerCard from "@/components/controller/CPlayerCard";

import { SERIES_COLORS } from "@/lib/seriesColors";

const PLAYER_COLORS = SERIES_COLORS;
const logger = createLogger("WaitingPage");

export const AdminWaitingView = () => {
  const navigate = useNavigate();
  const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
  const storedMatchCode = getMatchCode();
  const currentMatchCode = urlMatchCode || storedMatchCode || "";

  const { lastMessage, sendMessage } = useGameWebSocket();
  const [hoveredPlayerCode, setHoveredPlayerCode] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (urlMatchCode && urlMatchCode !== storedMatchCode) {
      setMatchCode(urlMatchCode);
    }
  }, [urlMatchCode, storedMatchCode]);
  useEffect(() => {
    if (!currentMatchCode) navigate("/operator/controller/overview");
  }, [currentMatchCode, navigate]);

  const { players, setPlayers, matchFinished, setMatchFinished } =
    useWaitingState(lastMessage);
  usePlayerTelemetry({ lastMessage, sendMessage, players, setPlayers });

  const [isOpeningMatch, setIsOpeningMatch] = useState(false);
  const [isIntroducingPlayers, setIsIntroducingPlayers] = useState(false);
  const [isShowingScoreboard, setIsShowingScoreboard] = useState(false);
  const [isEndingMatch, setIsEndingMatch] = useState(false);
  const [isFinishingMatch, setIsFinishingMatch] = useState(false);

  const sendPlayersSnapshot = useCallback(async () => {
    if (!currentMatchCode) return;
    try {
      const snapshot = await loadWaitingSnapshot(currentMatchCode);
      setMatchFinished(snapshot.matchFinished);
      setPlayers((prev) =>
        buildPlayersSnapshot(
          snapshot.players,
          snapshot.scoreboard,
          snapshot.profiles,
          prev,
        ),
      );
      await sendMessage({
        type: "send_players_info",
        players: buildWaitingBroadcastPlayers(snapshot),
        scoreboard: snapshot.scoreboard,
        profiles: snapshot.profiles,
      });
    } catch (error) {
      logger.error("Failed to load waiting snapshot:", error);
    }
  }, [currentMatchCode, sendMessage, setMatchFinished, setPlayers]);

  const handleEditScore = useCallback(
    (playerCode: string, newScore: number) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.playerCode === playerCode ? { ...p, playerScore: newScore } : p,
        ),
      );
      void sendPlayersSnapshot();
    },
    [sendPlayersSnapshot, setPlayers],
  );

  const sendRoundSnapshot = useCallback(async () => {
    await sendPlayersSnapshot();
  }, [sendPlayersSnapshot]);

  useEffect(() => {
    void sendPlayersSnapshot();
  }, [sendPlayersSnapshot]);

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage.message ?? lastMessage;
    queueMicrotask(() => {
      switch (msg.type) {
        case "user_online": {
          if (!msg.user_code) break;
          const pathByRole = { player: "/player/waiting", mc: "/operator/mc/waiting" };
          const path = pathByRole[msg.role as keyof typeof pathByRole];
          if (!path) break;
          if (msg.role === "player") {
            setPlayers((prev) =>
              prev.map((p) =>
                p.playerCode === msg.user_code
                  ? { ...p, playerConnected: true }
                  : p,
              ),
            );
          }
          void sendMessage({
            type: "navigate",
            user_code: msg.user_code,
            path,
          });
          void sendRoundSnapshot();
          break;
        }
      }
    });
  }, [lastMessage, sendMessage, sendRoundSnapshot, setPlayers]);

  const handleOpenMatch = useCallback(async () => {
    if (!currentMatchCode) return;
    setIsOpeningMatch(true);
    try {
      await sendMessage({ type: "match_state", state: "open" });
    } catch {
    } finally {
      setIsOpeningMatch(false);
    }
  }, [currentMatchCode, sendMessage]);
  const handleIntroducePlayers = useCallback(async () => {
    if (!currentMatchCode) return;
    setIsIntroducingPlayers(true);
    try {
      await sendMessage({ type: "introduce_players" });
    } catch {
    } finally {
      setIsIntroducingPlayers(false);
    }
  }, [currentMatchCode, sendMessage]);
  const handleShowScoreboard = useCallback(async () => {
    if (!currentMatchCode) return;
    setIsShowingScoreboard(true);
    try {
      await sendMessage({ type: "show_scoreboard" });
    } catch {
    } finally {
      setIsShowingScoreboard(false);
    }
  }, [currentMatchCode, sendMessage]);
  const handleEndMatch = useCallback(async () => {
    if (!currentMatchCode) return;
    setIsEndingMatch(true);
    try {
      await sendMessage({ type: "match_state", state: "ended" });
      await sendMessage({
        type: "navigate",
        user_code: "",
        path: "/player/waiting",
      });
      await sendPlayersSnapshot();
    } catch {
    } finally {
      setIsEndingMatch(false);
    }
  }, [currentMatchCode, sendMessage, sendPlayersSnapshot]);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  const handleFinishMatch = useCallback(async () => {
    if (!currentMatchCode) return;
    setIsFinishingMatch(true);
    try {
      await finishMatch(currentMatchCode);
      setMatchFinished(true);
      await sendMessage({ type: "match_state", state: "finished" });
      await sendPlayersSnapshot();
    } catch {
      notifyError("Lỗi kết nối khi hoàn thành trận đấu");
    } finally {
      setIsFinishingMatch(false);
    }
  }, [currentMatchCode, sendMessage, sendPlayersSnapshot, setMatchFinished]);

  const broadcastNavigate = useCallback(
    async (controllerPath: string, playerPath: string, round: string) => {
      if (!currentMatchCode) return;
      await sendMessage({ type: "round_start", round });
      await sendMessage({ type: "clear_question", user_code: "" });
      navigate(`${controllerPath}/${currentMatchCode}`);
      await sendMessage({
        type: "navigate",
        user_code: "",
        path: `${playerPath}/${currentMatchCode}`,
      });
      await sendRoundSnapshot();
    },
    [currentMatchCode, navigate, sendMessage, sendRoundSnapshot],
  );

  const handleNavigateToKDC = useCallback(() => {
    void broadcastNavigate("/operator/controller/kdc", "/player/kdc", "kdc");
  }, [broadcastNavigate]);
  const handleNavigateToKDR = useCallback(() => {
    void broadcastNavigate("/operator/controller/kdr", "/player/kdr", "kdr");
  }, [broadcastNavigate]);
  const handleNavigateToBP = useCallback(() => {
    void broadcastNavigate("/operator/controller/bp", "/player/bp", "bp");
  }, [broadcastNavigate]);
  const handleNavigateToVDC = useCallback(() => {
    void broadcastNavigate("/operator/controller/vdc/pick", "/player/vdc/pick", "vdc");
  }, [broadcastNavigate]);
  const handleNavigateToVDR = useCallback(() => {
    void broadcastNavigate("/operator/controller/vdr/pick", "/player/vdr/pick", "vdr");
  }, [broadcastNavigate]);
  const handleNavigateToGM = useCallback(() => {
    void broadcastNavigate("/operator/controller/gm", "/player/gm", "gm");
  }, [broadcastNavigate]);
  if (!currentMatchCode) return null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex flex-col flex-1 items-center gap-6 p-6 overflow-y-auto">
        <h1 className="font-display text-4xl xl:text-5xl font-bold text-foreground uppercase tracking-wide text-center">
          Sảnh Chờ
        </h1>
        <p className="text-brand text-sm">
          Mã trận: <strong>{currentMatchCode}</strong>
        </p>
        {players.length > 0 && (
          <div className="flex gap-4 max-w-7xl w-full justify-center">
            {players.map((player, index) => (
              <CPlayerCard
                key={player.playerCode}
                player={player}
                onEditScore={handleEditScore}
                matchCode={currentMatchCode}
                sendMessage={sendMessage}
                isHovered={hoveredPlayerCode === player.playerCode}
                isDimmed={
                  hoveredPlayerCode !== null &&
                  hoveredPlayerCode !== player.playerCode
                }
                onHover={setHoveredPlayerCode}
                accentColor={PLAYER_COLORS[index % PLAYER_COLORS.length]}
              />
            ))}
          </div>
        )}
        <div className="flex flex-col gap-4 w-full max-w-7xl">
          <div className="flex flex-wrap gap-4 items-center justify-center w-full">
            <CControlButton
              onClick={handleOpenMatch}
              disabled={isOpeningMatch || !currentMatchCode || matchFinished}
              className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
            >
              <Play size={18} />
              {isOpeningMatch ? "Đang gửi..." : "Mở đầu trận đấu"}
            </CControlButton>
            <CControlButton
              onClick={handleIntroducePlayers}
              disabled={
                isIntroducingPlayers || !currentMatchCode || matchFinished
              }
              className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
            >
              <UserCheck size={18} />
              {isIntroducingPlayers ? "Đang gửi..." : "Giới thiệu thí sinh"}
            </CControlButton>
            <CControlButton
              onClick={handleShowScoreboard}
              disabled={
                isShowingScoreboard || !currentMatchCode || matchFinished
              }
              className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
            >
              <Trophy size={18} />
              {isShowingScoreboard ? "Đang gửi..." : "Tổng kết điểm số"}
            </CControlButton>
            <CControlButton
              onClick={handleEndMatch}
              disabled={isEndingMatch || !currentMatchCode || matchFinished}
              className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center"
            >
              <Flag size={18} />
              {isEndingMatch ? "Đang gửi..." : "Kết thúc trận đấu"}
            </CControlButton>
            <AlertDialog
              open={showFinishConfirm}
              onOpenChange={setShowFinishConfirm}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xác nhận hoàn thành trận đấu?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Hành động kết thúc trận — không thể hoàn tác.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Huỷ</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setShowFinishConfirm(false);
                      void handleFinishMatch();
                    }}
                    className="bg-success font-semibold text-success-foreground hover:bg-success/90"
                  >
                    Hoàn thành
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <CControlButton
              onClick={() => setShowFinishConfirm(true)}
              disabled={isFinishingMatch || !currentMatchCode || matchFinished}
              className="!min-w-56 !h-14 xl:!min-w-64 xl:!h-16 text-sm xl:text-base gap-2 flex items-center justify-center bg-success hover:bg-success/90 disabled:bg-success/80 text-success-foreground"
            >
              <CheckCircle size={18} />
              {isFinishingMatch
                ? "Đang xác nhận..."
                : matchFinished
                  ? "Đã hoàn thành"
                  : "Xác nhận hoàn thành"}
            </CControlButton>
          </div>
        </div>
        <div className="flex flex-col gap-4 w-full max-w-7xl">
          <p className="text-foreground/60 text-xs uppercase tracking-widest text-center">
            Vòng chơi
          </p>
          <div
            className={`flex flex-wrap gap-4 items-center justify-center${matchFinished ? " pointer-events-none opacity-50" : ""}`}
          >
            <CControlButton
              onClick={handleNavigateToKDR}
              disabled={!currentMatchCode}
              className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center"
            >
              Khởi Động Riêng
            </CControlButton>
            <CControlButton
              onClick={handleNavigateToKDC}
              disabled={!currentMatchCode}
              className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center"
            >
              Khởi Động Chung
            </CControlButton>
            <CControlButton
              onClick={handleNavigateToGM}
              disabled={!currentMatchCode}
              className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center"
            >
              Giải Mã
            </CControlButton>
            <CControlButton
              onClick={handleNavigateToBP}
              disabled={!currentMatchCode}
              className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center"
            >
              Bứt Phá
            </CControlButton>
            <CControlButton
              onClick={handleNavigateToVDC}
              disabled={!currentMatchCode}
              className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center"
            >
              Về Đích Chung
            </CControlButton>
            <CControlButton
              onClick={handleNavigateToVDR}
              disabled={!currentMatchCode}
              className="!min-w-40 !h-12 text-sm gap-2 flex items-center justify-center"
            >
              Về Đích Riêng
            </CControlButton>
          </div>
        </div>
      </div>
    </div>
  );
};

