import { useGameWebSocket } from "@/hooks/useGameWebSocket";

import { useRoleSession } from "@/hooks/useRoleSession";

import { useWaitingState } from "@/hooks/useWaitingState";

import { WaitingView } from "@/components/shared/WaitingView";
import { ControllerWaitingView } from "@/components/controller/ControllerWaitingView";
import { PlayerWaitingView } from "@/components/player/PlayerWaitingView";

const MCWaitingView = () => {
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


const WaitingPage = () => {
  const { role } = useGameWebSocket();
  if (role === "controller") return <ControllerWaitingView />;
  if (role === "mc") return <MCWaitingView />;
  return <PlayerWaitingView />;
};

export default WaitingPage;

