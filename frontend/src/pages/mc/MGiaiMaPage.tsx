import { GiaiMaAudiencePage } from "@/components/shared/GiaiMaAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

const MGiaiMaPage = () => {
  const { matchCode } = useRoleSession("mc");
  return <GiaiMaAudiencePage Layout={PBasePageLayout} matchCode={matchCode} />;
};

export default MGiaiMaPage;
