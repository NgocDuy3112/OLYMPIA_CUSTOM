import { useParams } from "react-router-dom";
import { VeDichPickAudiencePage } from "@/components/shared/VeDichPickAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import type { VeDichRound } from "@/types/veDich";

interface MVeDichPickPageProps {
  round: VeDichRound;
}

const MVeDichPickPage = ({ round }: MVeDichPickPageProps) => {
  const { matchCode: routeMatchCode } = useParams<{ matchCode: string }>();
  const { matchCode } = useRoleSession("mc");
  return (
    <VeDichPickAudiencePage
      round={round}
      matchCode={routeMatchCode || matchCode}
      Layout={PBasePageLayout}
    />
  );
};

export default MVeDichPickPage;
