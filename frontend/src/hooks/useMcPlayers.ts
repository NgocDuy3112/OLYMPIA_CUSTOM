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
                return { ...p, playerLastAnswer: ans.content ?? ans.answer_text, playerTimestamp: ans.timestamp || p.playerTimestamp };
            }),
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
            })),
        );
    }, []);

    return { players, setPlayers, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, applyBuzz, clearAnswers };
}
