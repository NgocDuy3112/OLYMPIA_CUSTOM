import type { SpectatorLayoutProps } from "@/types/spectator";
import type { ComponentType } from "react";
import { VeDichChungSpectatorPage } from "@/components/shared/VeDichChungSpectatorPage";
import { VeDichRiengSpectatorPage } from "@/components/shared/VeDichRiengSpectatorPage";

interface VeDichSpectatorPageProps {
  variant: "chung" | "rieng";
  Layout: ComponentType<SpectatorLayoutProps>;
  matchCode?: string;
}

export function VeDichSpectatorPage({
  variant,
  Layout,
  matchCode,
}: VeDichSpectatorPageProps) {
  if (variant === "chung") {
    return <VeDichChungSpectatorPage Layout={Layout} matchCode={matchCode} />;
  }
  return <VeDichRiengSpectatorPage Layout={Layout} matchCode={matchCode} />;
}
