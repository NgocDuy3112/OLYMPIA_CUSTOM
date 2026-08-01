import type { ComponentType, ReactNode } from "react";
import { VeDichChungAudiencePage } from "@/components/shared/VeDichChungAudiencePage";
import { VeDichRiengAudiencePage } from "@/components/shared/VeDichRiengAudiencePage";
import type { PlayerStatus } from "@/types/player";

interface AudienceLayoutProps {
  players: PlayerStatus[];
  currentPlayerCode: string;
  currentTurnPlayerCode?: string | null;
  buzzerWinnerCode?: string | null;
  children?: ReactNode;
}

interface VeDichAudiencePageProps {
  variant: "chung" | "rieng";
  Layout: ComponentType<AudienceLayoutProps>;
  matchCode?: string;
}

export function VeDichAudiencePage({ variant, Layout, matchCode }: VeDichAudiencePageProps) {
  if (variant === "chung") {
    return <VeDichChungAudiencePage Layout={Layout} matchCode={matchCode} />;
  }
  return <VeDichRiengAudiencePage Layout={Layout} />;
}
