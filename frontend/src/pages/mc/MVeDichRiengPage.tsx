import { VeDichAudiencePage } from "@/components/shared/VeDichAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

const MVeDichRiengPage = () => {
  const { matchCode } = useRoleSession("mc");
  return <VeDichAudiencePage variant="rieng" Layout={PBasePageLayout} matchCode={matchCode} />;
};

export default MVeDichRiengPage;
