import { WaitingView } from "@/components/shared/WaitingView";
import { useRoleSession } from "@/hooks/useRoleSession";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useWaitingState } from "@/hooks/useWaitingState";

const GWaitingPage = () => {
  const { matchCode } = useRoleSession("guest");
  const { lastMessage } = useGameWebSocket();
  const state = useWaitingState(lastMessage);

  return (
    <WaitingView
      {...state}
      matchCode={matchCode}
      finishedMessage="Các vòng thi đã kết thúc. Chỉ có thể xem kết quả."
    />
  );
};

export default GWaitingPage;
