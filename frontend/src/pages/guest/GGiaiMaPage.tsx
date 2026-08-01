import { GiaiMaAudiencePage } from "@/components/shared/GiaiMaAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { GBasePageLayout } from "@/pages/guest/GBasePageLayout";

const GGiaiMaPage = () => {
  const { matchCode } = useRoleSession("guest");
  return <GiaiMaAudiencePage Layout={GBasePageLayout} matchCode={matchCode} />;
};

export default GGiaiMaPage;
