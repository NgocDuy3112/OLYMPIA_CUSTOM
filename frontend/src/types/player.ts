export interface PlayerStatus {
    playerCode: string;
    playerName: string;
    playerScore: number;
    playerLastAnswer?: string;
    playerTimestamp?: number;
    playerHasBuzzed?: boolean;
}