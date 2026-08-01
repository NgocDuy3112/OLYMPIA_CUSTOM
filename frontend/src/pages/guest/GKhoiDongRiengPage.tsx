import { KhoiDongAudiencePage } from "@/components/shared/KhoiDongAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { GBasePageLayout } from "@/pages/guest/GBasePageLayout";

const GKhoiDongRiengPage = () => {
  const { matchCode } = useRoleSession("guest");
  return <KhoiDongAudiencePage variant="rieng" Layout={GBasePageLayout} matchCode={matchCode} />;
};

export default GKhoiDongRiengPage;
