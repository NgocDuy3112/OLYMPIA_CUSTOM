import { useGameWebSocket } from "@/hooks/useGameWebSocket";

import { useRoleSession } from "@/hooks/useRoleSession";

import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

import { SKhoiDongPage } from "@/components/shared/SKhoiDongPage";
import { AdminKhoiDongRiengView } from "@/components/controller/AdminKhoiDongRiengView";
import { PlayerKhoiDongRiengView } from "@/components/player/PlayerKhoiDongRiengView";

const MCKhoiDongRiengView = () => {
  const { matchCode } = useRoleSession("mc");
  return (
    <SKhoiDongPage
      variant="rieng"
      Layout={PBasePageLayout}
      matchCode={matchCode}
    />
  );
};


const KhoiDongRiengPage = () => {
  const { role } = useGameWebSocket();
  if (role === "controller") return <AdminKhoiDongRiengView />;
  if (role === "mc") return <MCKhoiDongRiengView />;
  return <PlayerKhoiDongRiengView />;
};

export default KhoiDongRiengPage;

