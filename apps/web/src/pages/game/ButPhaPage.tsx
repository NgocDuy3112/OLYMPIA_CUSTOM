import { useGameWebSocket } from "@/hooks/useGameWebSocket";

import { useRoleSession } from "@/hooks/useRoleSession";

import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

import { SButPhaPage } from "@/components/shared/SButPhaPage";
import { AdminButPhaView } from "@/components/controller/AdminButPhaView";
import { PlayerButPhaView } from "@/components/player/PlayerButPhaView";

const MCButPhaView = () => {
  const { matchCode } = useRoleSession("mc");
  return <SButPhaPage Layout={PBasePageLayout} matchCode={matchCode} />;
};


const ButPhaPage = () => {
  const { role } = useGameWebSocket();
  if (role === "controller") return <AdminButPhaView />;
  if (role === "mc") return <MCButPhaView />;
  return <PlayerButPhaView />;
};

export default ButPhaPage;

