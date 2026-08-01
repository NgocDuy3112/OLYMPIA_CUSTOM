import { VeDichAudiencePage } from "@/components/shared/VeDichAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { GBasePageLayout } from "@/pages/guest/GBasePageLayout";

const GVeDichRiengPage = () => {
  const { matchCode } = useRoleSession("guest");
  return <VeDichAudiencePage variant="rieng" Layout={GBasePageLayout} matchCode={matchCode} />;
};

export default GVeDichRiengPage;
