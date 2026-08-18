export interface PlayerStatus {
  playerCode: string;
  playerName: string;
  playerScore: number;
  playerLastAnswer?: string;
  playerTimestamp?: number;
  playerHasBuzzed?: boolean;
  playerConnected?: boolean;
  playerAfk?: boolean;
  playerIsTurn?: boolean;
  playerHasSubmittedKeyword?: boolean;
  playerKeywordCluesOpened?: number;
  playerPower?: "star" | "shield" | null;
  playerCorrectScore?: number;
  playerAvgResponseTime?: number;
  playerWrongAttempts?: number;
  playerLatencyMs?: number | null;
}
