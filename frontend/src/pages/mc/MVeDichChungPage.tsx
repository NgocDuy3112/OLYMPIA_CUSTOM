import { VeDichAudiencePage } from "@/components/shared/VeDichAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

const MVeDichChungPage = () => {
  const { matchCode } = useRoleSession("mc");
  return <VeDichAudiencePage variant="chung" Layout={PBasePageLayout} matchCode={matchCode} />;
};

export default MVeDichChungPage;
