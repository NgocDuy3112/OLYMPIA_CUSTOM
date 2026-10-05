import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useRoleSession } from "@/hooks/useRoleSession";

import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { SKhoiDongPage } from "@/components/shared/SKhoiDongPage";
import { ControllerKhoiDongChungView } from "@/components/controller/ControllerKhoiDongChungView";
import { PlayerKhoiDongChungView } from "@/components/player/PlayerKhoiDongChungView";

const MCKhoiDongChungView = () => {
  const { matchCode } = useRoleSession("mc");
  return (
    <SKhoiDongPage
      variant="chung"
      Layout={PBasePageLayout}
      matchCode={matchCode}
    />
  );
};

const KhoiDongChungPage = () => {
  const { role } = useGameWebSocket();
  if (role === "controller") return <ControllerKhoiDongChungView />;
  if (role === "mc") return <MCKhoiDongChungView />;
  return <PlayerKhoiDongChungView />;
};

export default KhoiDongChungPage;
