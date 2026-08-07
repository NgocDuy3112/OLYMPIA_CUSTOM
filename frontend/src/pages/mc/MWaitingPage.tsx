import { WaitingView } from "@/components/shared/WaitingView";
import { useRoleSession } from "@/hooks/useRoleSession";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useWaitingState } from "@/hooks/useWaitingState";

const MWaitingPage = () => {
  const { matchCode } = useRoleSession("mc");
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

export default MWaitingPage;
