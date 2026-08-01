import { KhoiDongAudiencePage } from "@/components/shared/KhoiDongAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

const MKhoiDongChungPage = () => {
  const { matchCode } = useRoleSession("mc");
  return <KhoiDongAudiencePage variant="chung" Layout={PBasePageLayout} matchCode={matchCode} />;
};

export default MKhoiDongChungPage;
