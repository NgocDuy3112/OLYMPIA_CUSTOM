/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useState } from "react";
import type { PlayerStatus } from "@/types/player";

function buildMcPlayers(playersList: any[]): PlayerStatus[] {
    return playersList.map((p: any) => {
        const code = String(p?.user_code ?? "");
        let name = p?.user_name ?? "";
        let scoreVal = 0;
        if (typeof p?.cumulative_score === "number") scoreVal = p.cumulative_score;
        else if (typeof p?.cumulative_score === "number") scoreVal = p.cumulative_score;
        return {
            playerCode: code,
            playerName: name,
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

export function useMcPlayers() {
    const [players, setPlayers] = useState<PlayerStatus[]>([]);

    const applyPlayersInfo = useCallback((msg: any) => {
        const playersList = msg?.players ?? [];
        setPlayers(buildMcPlayers(playersList));
    }, []);

    const applyScoreUpdate = useCallback((msg: any) => {
        if (msg?.user_code && typeof msg?.new_total_score === "number") {
            setPlayers((prev) =>
                prev.map((p) =>
                    p.playerCode === msg.user_code ? { ...p, playerScore: msg.new_total_score } : p,
                ),
            );
        }
    }, []);

    const applyAnswers = useCallback((msg: any) => {
        const answers: any[] = msg?.answers ?? [];
        setPlayers((prev) =>
            prev.map((p) => {
                const ans = answers.find((a: any) => a.user_code === p.playerCode);
                if (!ans) return p;
                return {
                    ...p,
                    playerLastAnswer: ans.content ?? ans.answer_text,
                    // Per Giải Mã rules, `send_keyword_answers` broadcasts keyword text with
                    // `timestamp: undefined` so the player card omits the timestamp. Only
                    // overwrite when the broadcast provides a numeric timestamp.
                    playerTimestamp: typeof ans.timestamp === "number" ? ans.timestamp : p.playerTimestamp,
                    playerKeywordCluesOpened: typeof ans.clues_opened === "number" ? ans.clues_opened : p.playerKeywordCluesOpened,
                };
            }),
        );
    }, []);

    const applyKeywordSubmit = useCallback((msg: any) => {
        const { user_code, clues_opened } = msg ?? {};
        if (!user_code) return;
        setPlayers((prev) =>
            prev.map((p) =>
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

    const applyRealTimeAnswer = useCallback((msg: any) => {
        const { user_code, answer_text, timestamp } = msg ?? {};
        if (user_code && answer_text) {
            setPlayers((prev) =>
                prev.map((p) =>
                    p.playerCode === user_code
                        ? { ...p, playerLastAnswer: answer_text, playerTimestamp: timestamp || p.playerTimestamp }
                        : p,
                ),
            );
        }
    }, []);

    const applyBuzz = useCallback((msg: any) => {
        const { user_code } = msg ?? {};
        if (user_code) {
            setPlayers((prev) =>
                prev.map((p) => (p.playerCode === user_code ? { ...p, playerHasBuzzed: true } : p)),
            );
        }
    }, []);

    const clearAnswers = useCallback(() => {
        setPlayers((prev) =>
            prev.map((p) => ({
                ...p,
                playerLastAnswer: undefined,
                playerTimestamp: undefined,
                playerHasBuzzed: undefined,
                playerWrongAttempts: undefined,
            })),
        );
    }, []);

    const applyPlayerPower = useCallback((userCode: string, power: "star" | "shield") => {
        setPlayers((prev) =>
            prev.map((p) =>
                p.playerCode === userCode ? { ...p, playerPower: power } : p,
            ),
        );
    }, []);

    const applyWrongAttempt = useCallback((msg: any) => {
        const { user_code, attempt_count } = msg ?? {};
        if (user_code && attempt_count) {
            setPlayers((prev) =>
                prev.map((p) =>
                    p.playerCode === user_code ? { ...p, playerWrongAttempts: attempt_count } : p,
                ),
            );
        }
    }, []);

    return { players, setPlayers, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, applyBuzz, applyPlayerPower, applyWrongAttempt, applyKeywordSubmit, clearAnswers };
}
