export interface PlayerStatus {
    playerCode: string;
    playerName: string;
    playerScore: number;
    playerLastAnswer?: string;
    playerTimestamp?: number;
    playerHasBuzzed?: boolean;
    // indicates whether the player's client has an active websocket connection
    playerConnected?: boolean;
}