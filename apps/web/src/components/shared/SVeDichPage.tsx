import type { SpectatorLayoutProps } from "@/types/spectator";
import type { ComponentType } from "react";
import { SVeDichChungPage } from "@/components/shared/SVeDichChungPage";
import { SVeDichRiengPage } from "@/components/shared/SVeDichRiengPage";

interface SVeDichPageProps {
  variant: "chung" | "rieng";
  Layout: ComponentType<SpectatorLayoutProps>;
  matchCode?: string;
}

export function SVeDichPage({
  variant,
  Layout,
  matchCode,
}: SVeDichPageProps) {
  if (variant === "chung") {
    return <SVeDichChungPage Layout={Layout} matchCode={matchCode} />;
  }
  return <SVeDichRiengPage Layout={Layout} matchCode={matchCode} />;
}
