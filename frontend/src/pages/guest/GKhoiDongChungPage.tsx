import { KhoiDongAudiencePage } from "@/components/shared/KhoiDongAudiencePage";
import { useRoleSession } from "@/hooks/useRoleSession";
import { GBasePageLayout } from "@/pages/guest/GBasePageLayout";

const GKhoiDongChungPage = () => {
  const { matchCode } = useRoleSession("guest");
  return <KhoiDongAudiencePage variant="chung" Layout={GBasePageLayout} matchCode={matchCode} />;
};

export default GKhoiDongChungPage;
