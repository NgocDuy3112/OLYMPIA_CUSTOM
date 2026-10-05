import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useRoleSession } from "@/hooks/useRoleSession";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { SGiaiMaPage } from "@/components/shared/SGiaiMaPage";

import { ControllerGiaiMaView } from "@/components/controller/ControllerGiaiMaView";
import { PlayerGiaiMaView } from "@/components/player/PlayerGiaiMaView";

const MCGiaiMaView = () => {
  const { matchCode } = useRoleSession("mc");
  return <SGiaiMaPage Layout={PBasePageLayout} matchCode={matchCode} />;
};

const GiaiMaPage = () => {
  const { role } = useGameWebSocket();
  if (role === "controller") return <ControllerGiaiMaView />;
  if (role === "mc") return <MCGiaiMaView />;
  return <PlayerGiaiMaView />;
};

export default GiaiMaPage;
