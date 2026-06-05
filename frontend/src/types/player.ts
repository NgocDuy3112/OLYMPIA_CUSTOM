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
    // indicates that this player has submitted a keyword (giải mã round), icon shown until admin reveals
    playerHasSubmittedKeyword?: boolean;
    // Number of clue cards open at the moment the player submitted their keyword (giải mã round).
    // Used to show "Sau N gợi ý" next to the key icon after admin reveals the keyword.
    playerKeywordCluesOpened?: number;
    // Quyền năng đã chọn trong Về Đích (star = Ngôi Sao Hy Vọng, shield = Bảo Hộ Miễn Trừ)
    playerPower?: "star" | "shield" | null;
    // Qualifier-specific tie-breaker fields (only used in AQualifierPage)
    playerCorrectScore?: number;
    playerAvgResponseTime?: number;
    // Number of wrong attempts in current question (used in Khoi Dong Rieng)
    playerWrongAttempts?: number;
}