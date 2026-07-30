import { useCallback, useState } from "react";
import type { PlayerStatus } from "@/types/player";

function buildGuestPlayers(playersList: any[]): PlayerStatus[] {
    return playersList.map((p: any) => {
        const code = String(p?.user_code ?? "");
        let scoreVal = 0;
        if (typeof p?.cumulative_score === "number") scoreVal = p.cumulative_score;
        return {
            playerCode: code,
            playerName: p?.user_name ?? "",
            playerScore: scoreVal,
            playerLastAnswer: undefined,
            playerTimestamp: undefined,
            playerHasBuzzed: undefined,
            playerIsTurn: p?.is_current ?? false,
            playerPower: undefined,
            playerWrongAttempts: undefined,
        };
    });
}

export function useGuestPlayers() {
    const [players, setPlayers] = useState<PlayerStatus[]>([]);

    const applyPlayersInfo = useCallback((msg: any) => {
        const playersList = msg?.players ?? [];
        setPlayers(buildGuestPlayers(playersList));
    }, []);

    const applyScoreUpdate = useCallback((msg: any) => {
        if (msg?.user_code && typeof msg?.new_total_score === "number") {
            setPlayers((prev: PlayerStatus[]) =>
                prev.map((p: PlayerStatus) =>
                    p.playerCode === msg.user_code ? { ...p, playerScore: msg.new_total_score } : p,
                ),
            );
        }
    }, []);

    const applyAnswers = useCallback((msg: any) => {
        const answers: any[] = msg?.answers ?? [];
        setPlayers((prev: PlayerStatus[]) =>
            prev.map((p: PlayerStatus) => {
                const ans = answers.find((a: any) => a.user_code === p.playerCode);
                if (!ans) return p;
                return {
                    ...p,
                    playerLastAnswer: ans.content ?? ans.answer_text,
                    playerTimestamp: typeof ans.timestamp === "number" ? ans.timestamp : p.playerTimestamp,
                    playerKeywordCluesOpened: typeof ans.clues_opened === "number" ? ans.clues_opened : p.playerKeywordCluesOpened,
                };
            }),
        );
    }, []);

    const applyKeywordSubmit = useCallback((msg: any) => {
        const { user_code, clues_opened } = msg ?? {};
        if (!user_code) return;
        setPlayers((prev: PlayerStatus[]) =>
            prev.map((p: PlayerStatus) =>
                p.playerCode === user_code
                    ? {
                            ...p,
                            playerHasSubmittedKeyword: true,
                            playerKeywordCluesOpened:
                                typeof clues_opened === "number" ? clues_opened : p.playerKeywordCluesOpened,
                        }
                    : p,
            ),
        );
    }, []);

    const applyBuzz = useCallback((msg: any) => {
        const { user_code } = msg ?? {};
        if (user_code) {
            setPlayers((prev: PlayerStatus[]) =>
                prev.map((p: PlayerStatus) => (p.playerCode === user_code ? { ...p, playerHasBuzzed: true } : p)),
            );
        }
    }, []);

    const clearAnswers = useCallback(() => {
        setPlayers((prev: PlayerStatus[]) =>
            prev.map((p: PlayerStatus) => ({
                ...p,
                playerLastAnswer: undefined,
                playerTimestamp: undefined,
                playerHasBuzzed: undefined,
                playerWrongAttempts: undefined,
            })),
        );
    }, []);

    const applyPlayerPower = useCallback((userCode: string, power: "star" | "shield") => {
        setPlayers((prev: PlayerStatus[]) =>
            prev.map((p: PlayerStatus) =>
                p.playerCode === userCode ? { ...p, playerPower: power } : p,
            ),
        );
    }, []);

    const applyWrongAttempt = useCallback((msg: any) => {
        const { user_code, attempt_count } = msg ?? {};
        if (user_code && attempt_count) {
            setPlayers((prev: PlayerStatus[]) =>
                prev.map((p: PlayerStatus) =>
                    p.playerCode === user_code ? { ...p, playerWrongAttempts: attempt_count } : p,
                ),
            );
        }
    }, []);

    return { players, setPlayers, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyBuzz, applyPlayerPower, applyWrongAttempt, applyKeywordSubmit, clearAnswers };
}