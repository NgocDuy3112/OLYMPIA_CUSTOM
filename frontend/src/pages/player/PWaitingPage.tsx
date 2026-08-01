import { useParams } from "react-router-dom";
import { WaitingView } from "@/components/shared/WaitingView";
import { usePlayerProtection } from "@/hooks/usePlayerProtection";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useWaitingState } from "@/hooks/useWaitingState";

const PWaitingPage = () => {
  usePlayerProtection(true);
  const { matchCode: matchCodeParam } = useParams<{ matchCode: string }>();
  const matchCode = matchCodeParam ?? localStorage.getItem("matchCode") ?? "";
  const playerCode = sessionStorage.getItem("playerCode") ?? "";
  const { lastMessage } = useGameWebSocket();
  const state = useWaitingState(lastMessage);

  return (
    <WaitingView
      {...state}
      matchCode={matchCode}
      currentPlayerCode={playerCode}
      finishedMessage="Các vòng thi đã kết thúc. Bạn chỉ có thể xem kết quả."
    />
  );
};

export default PWaitingPage;
