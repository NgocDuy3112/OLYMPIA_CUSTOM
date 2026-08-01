import type { ReactNode } from "react";
import type { PlayerStatus } from "@/types/player";

export interface AudienceLayoutProps {
  players: PlayerStatus[];
  currentPlayerCode: string;
  currentTurnPlayerCode?: string | null;
  buzzerWinnerCode?: string | null;
  matchCode?: string;
  children?: ReactNode;
}
