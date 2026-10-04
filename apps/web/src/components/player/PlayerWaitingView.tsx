import { useParams } from "react-router-dom";

import { getPlayerCode } from "@/utils/storage";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";

import { usePlayerProtection } from "@/hooks/usePlayerProtection";

import { useWaitingState } from "@/hooks/useWaitingState";

import { WaitingView } from "@/components/shared/WaitingView";

export const PlayerWaitingView = () => {
  usePlayerProtection(true);
  const { matchCode: routeMatchCode } = useParams<{ matchCode: string }>();
  const playerCode = getPlayerCode();
  const { lastMessage } = useGameWebSocket();
  const state = useWaitingState(lastMessage);
  return (
    <WaitingView
      {...state}
      matchCode={routeMatchCode ?? ""}
      currentPlayerCode={playerCode}
      finishedMessage="Các vòng thi đã kết thúc. Bạn chỉ có thể xem kết quả."
    />
  );
};

