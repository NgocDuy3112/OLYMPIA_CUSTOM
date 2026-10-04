import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useRoleSession } from "@/hooks/useRoleSession";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { SGiaiMaPage } from "@/components/shared/SGiaiMaPage";

import { AdminGiaiMaView } from "@/components/controller/AdminGiaiMaView";
import { PlayerGiaiMaView } from "@/components/player/PlayerGiaiMaView";

const MCGiaiMaView = () => {
  const { matchCode } = useRoleSession("mc");
  return <SGiaiMaPage Layout={PBasePageLayout} matchCode={matchCode} />;
};

const GiaiMaPage = () => {
  const { role } = useGameWebSocket();
  if (role === "controller") return <AdminGiaiMaView />;
  if (role === "mc") return <MCGiaiMaView />;
  return <PlayerGiaiMaView />;
};

export default GiaiMaPage;
