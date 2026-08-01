import { useParams } from "react-router-dom";
import { VeDichPickAudiencePage } from "@/components/shared/VeDichPickAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { GBasePageLayout } from "@/pages/guest/GBasePageLayout";
import type { VeDichRound } from "@/types/veDich";

interface GVeDichPickPageProps {
  round: VeDichRound;
}

const GVeDichPickPage = ({ round }: GVeDichPickPageProps) => {
  const { matchCode: routeMatchCode } = useParams<{ matchCode: string }>();
  const { matchCode } = useRoleSession("guest");
  return (
    <VeDichPickAudiencePage
      round={round}
      matchCode={routeMatchCode || matchCode}
      Layout={GBasePageLayout}
    />
  );
};

export default GVeDichPickPage;
