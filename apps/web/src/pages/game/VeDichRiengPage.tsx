import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useRoleSession } from "@/hooks/useRoleSession";

import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { SVeDichPage } from "@/components/shared/SVeDichPage";
import { ControllerVeDichRiengView } from "@/components/controller/ControllerVeDichRiengView";
import { PlayerVeDichRiengView } from "@/components/player/PlayerVeDichRiengView";

const MCVeDichRiengView = () => {
  const { matchCode } = useRoleSession("mc");
  return (
    <SVeDichPage
      variant="rieng"
      Layout={PBasePageLayout}
      matchCode={matchCode}
    />
  );
};

const VeDichRiengPage = () => {
  const { role } = useGameWebSocket();
  if (role === "controller") return <ControllerVeDichRiengView />;
  if (role === "mc") return <MCVeDichRiengView />;
  return <PlayerVeDichRiengView />;
};
export default VeDichRiengPage;
