/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import PPlayerRec from "@/components/player/PPlayerRec";
import type { PlayerStatus } from "@/types/player";
import { API_BASE_URL } from "@/configs";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";
import { useMcSession } from "@/hooks/useMcSession";

interface RoomPlayer {
    user_code: string;
    user_name: string;
    position: number;
}

const MWaitingPage: React.FC = () => {
    const { matchCode, token } = useMcSession();
    const { lastMessage } = useMcWebSocket();

    const [matchName, setMatchName] = useState<string>("");
    const [players, setPlayers] = useState<PlayerStatus[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!matchCode || !token) {
            setLoaded(true);
            return;
        }
        fetch(`${API_BASE_URL}/matches/${encodeURIComponent(matchCode)}/room`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => res.json())
            .then((json) => {
                const data = json?.data ?? {};
                setMatchName(data.match_name ?? "");
                const roomPlayers: RoomPlayer[] = data.players ?? [];
                setPlayers(
                    roomPlayers.map((p) => ({
                        playerCode: p.user_code,
                        playerName: p.user_name,
                        playerScore: 0,
                    })),
                );
            })
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, [matchCode, token]);

    useEffect(() => {
        if (!lastMessage) return;
        const raw = lastMessage as any;
        const msg = raw?.message ?? raw;

        if (msg?.type === "send_players_info") {
            const list: unknown[] = msg?.players ?? [];
            setPlayers(list.map((p: any) => ({
                playerCode: String(p?.user_code ?? ""),
                playerName: p?.user_name ?? "",
                playerScore:
                    typeof p?.cumulative_score === "number" ? p.cumulative_score :
                    typeof p?.cummulative_score === "number" ? p.cummulative_score : 0,
            })));
        } else if (msg?.type === "player_score_updated") {
            if (msg?.user_code && typeof msg?.new_total_score === "number") {
                setPlayers((prev) =>
                    prev.map((p) =>
                        p.playerCode === msg.user_code ? { ...p, playerScore: msg.new_total_score } : p,
                    ),
                );
            }
        }
    }, [lastMessage]);

    return (
        <div className="flex flex-col justify-start items-center h-screen overflow-hidden p-4">
            {/* Match name banner */}
            <div className="mt-8 text-center">
                <h1 className="font-[SVN-Gratelos_Display] text-5xl font-bold text-white uppercase tracking-wide">
                    OLYMPIA CUSTOM 3
                </h1>
                {loaded && matchName && (
                    <p className="mt-2 text-2xl font-semibold text-blue-300 uppercase">{matchName}</p>
                )}
                {loaded && !matchName && matchCode && (
                    <p className="mt-2 text-lg text-blue-300">Mã trận: <strong>{matchCode}</strong></p>
                )}
            </div>

            {/* Player cards */}
            {loaded && players.length > 0 && (
                <div className="flex gap-4 max-w-7xl w-full justify-center mt-8">
                    {players.map((p) => (
                        <PPlayerRec
                            key={p.playerCode}
                            player={p}
                            isCurrent={false}
                        />
                    ))}
                </div>
            )}

            {/* Status */}
            <p className="mt-8 text-sm text-white/60 text-center">
                MC đang theo dõi — hệ thống sẽ tự chuyển màn hình khi admin điều hướng.
            </p>
        </div>
    );
};

export default MWaitingPage;
