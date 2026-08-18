import type { AudienceLayoutProps } from "@/types/audience";
import type { ComponentType } from "react";
import { VeDichChungAudiencePage } from "@/components/shared/VeDichChungAudiencePage";
import { VeDichRiengAudiencePage } from "@/components/shared/VeDichRiengAudiencePage";

interface VeDichAudiencePageProps {
  variant: "chung" | "rieng";
  Layout: ComponentType<AudienceLayoutProps>;
  matchCode?: string;
}

export function VeDichAudiencePage({
  variant,
  Layout,
  matchCode,
}: VeDichAudiencePageProps) {
  if (variant === "chung") {
    return <VeDichChungAudiencePage Layout={Layout} matchCode={matchCode} />;
  }
  return <VeDichRiengAudiencePage Layout={Layout} matchCode={matchCode} />;
}
