import { VeDichAudiencePage } from "@/components/shared/VeDichAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { GBasePageLayout } from "@/pages/guest/GBasePageLayout";

const GVeDichChungPage = () => {
  const { matchCode } = useRoleSession("guest");
  return <VeDichAudiencePage variant="chung" Layout={GBasePageLayout} matchCode={matchCode} />;
};

export default GVeDichChungPage;
