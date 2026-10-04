import { useParams } from "react-router-dom";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useRoleSession } from "@/hooks/useRoleSession";
import { VeDichRound } from "@/types/veDich";

import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { SVeDichPickPage } from "@/components/shared/SVeDichPickPage";
import { AdminVeDichPickView } from "@/components/controller/AdminVeDichPickView";
import { PlayerVeDichPickView } from "@/components/player/PlayerVeDichPickView";

const MCVeDichPickView = ({ round }: { round: VeDichRound }) => {
  const { matchCode: routeMatchCode } = useParams<{ matchCode: string }>();
  const { matchCode } = useRoleSession("mc");
  return (
    <SVeDichPickPage
      round={round}
      matchCode={routeMatchCode || matchCode}
      Layout={PBasePageLayout}
    />
  );
};

interface VeDichPickPageProps {
  round: VeDichRound;
}
const VeDichPickPage = ({ round }: VeDichPickPageProps) => {
  const { role } = useGameWebSocket();
  if (role === "controller") return <AdminVeDichPickView />;
  if (role === "mc") return <MCVeDichPickView round={round} />;
  return <PlayerVeDichPickView round={round} />;
};

export default VeDichPickPage;
