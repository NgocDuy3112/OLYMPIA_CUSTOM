export interface PlayerStatus {
    playerCode: string;
    playerName: string;
    playerScore: number;
    playerLastAnswer?: string;
    playerTimestamp?: number;
    playerHasBuzzed?: boolean;
    // indicates whether the player's client has an active websocket connection
    playerConnected?: boolean;
    // indicates whether this player is the currently active/selected player for solo rounds
    playerIsTurn?: boolean;
    // Qualifier-specific tie-breaker fields (only used in AQualifierPage)
    playerCorrectScore?: number;
    playerAvgResponseTime?: number;
}