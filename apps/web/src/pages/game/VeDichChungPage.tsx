import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useRoleSession } from "@/hooks/useRoleSession";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { SVeDichPage } from "@/components/shared/SVeDichPage";
import { AdminVeDichChungView } from "@/components/controller/AdminVeDichChungView";
import { PlayerVeDichChungView } from "@/components/player/PlayerVeDichChungView";

const MCVeDichChungView = () => {
  const { matchCode } = useRoleSession("mc");
  return (
    <SVeDichPage
      variant="chung"
      Layout={PBasePageLayout}
      matchCode={matchCode}
    />
  );
};

const VeDichChungPage = () => {
  const { role } = useGameWebSocket();
  if (role === "controller") return <AdminVeDichChungView />;
  if (role === "mc") return <MCVeDichChungView />;
  return <PlayerVeDichChungView />;
};
export default VeDichChungPage;
