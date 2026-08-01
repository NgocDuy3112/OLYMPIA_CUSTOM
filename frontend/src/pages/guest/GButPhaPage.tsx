import { ButPhaAudiencePage } from "@/components/shared/ButPhaAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { GBasePageLayout } from "@/pages/guest/GBasePageLayout";

const GButPhaPage = () => {
  const { matchCode } = useRoleSession("guest");
  return <ButPhaAudiencePage Layout={GBasePageLayout} matchCode={matchCode} />;
};

export default GButPhaPage;
