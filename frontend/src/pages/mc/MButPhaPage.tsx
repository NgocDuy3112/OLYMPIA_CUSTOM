import { ButPhaAudiencePage } from "@/components/shared/ButPhaAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

const MButPhaPage = () => {
  const { matchCode } = useRoleSession("mc");
  return <ButPhaAudiencePage Layout={PBasePageLayout} matchCode={matchCode} />;
};

export default MButPhaPage;
