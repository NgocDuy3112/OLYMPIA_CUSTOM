import { KhoiDongAudiencePage } from "@/components/shared/KhoiDongAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";

const MKhoiDongRiengPage = () => {
  const { matchCode } = useRoleSession("mc");
  return <KhoiDongAudiencePage variant="rieng" Layout={PBasePageLayout} matchCode={matchCode} />;
};

export default MKhoiDongRiengPage;
