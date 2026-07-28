import React, { useCallback, useEffect, useState } from "react";
import PPlayerRec from "@/components/player/PPlayerRec";
import type { PlayerStatus } from "@/types/player";
import { useGuestWebSocket } from "@/hooks/useGuestWebSocket";
import { useGuestSession } from "@/hooks/useGuestSession";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";

const GWaitingPage: React.FC = () => {
    const { matchCode } = useGuestSession();
    const { lastMessage } = useGuestWebSocket();

    const [matchName, setMatchName] = useState<string>("");
    const [players, setPlayers] = useState<PlayerStatus[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [matchFinished, setMatchFinished] = useState(false);

    const applyPlayersSnapshot = useCallback(
        (payload: { players?: any[]; scoreboard?: any[]; profiles?: any[] }) => {
            const playersList = Array.isArray(payload?.players) ? payload.players : [];
            const scoreboardList = Array.isArray(payload?.scoreboard) ? payload.scoreboard : [];
            const profileList = Array.isArray(payload?.profiles) ? payload.profiles : [];
            setPlayers((prev) => buildPlayersSnapshot(playersList, scoreboardList, profileList, prev));
            setLoaded(true);
        },
        [],
    );

    useEffect(() => {
        if (!lastMessage) return;
        const raw = lastMessage as any;
        const msg = raw?.message ?? raw;

        switch (msg?.type) {
            case "send_room_info": {
                setMatchName(msg.match_name ?? "");
                if (msg.match_status === "finished") setMatchFinished(true);
                setLoaded(true);
                break;
            }
            case "send_players_info": {
                applyPlayersSnapshot(msg);
                break;
            }
            case "player_score_updated": {
                if (msg.user_code && typeof msg.new_total_score === "number") {
                    setPlayers((prev) =>
                        prev.map((p) =>
                            p.playerCode === msg.user_code ? { ...p, playerScore: msg.new_total_score } : p,
                        ),
                    );
                }
                break;
            }
            case "finish_match": {
                setMatchFinished(true);
                break;
            }
        }
    }, [applyPlayersSnapshot, lastMessage]);

    return (
        <div className="flex flex-col justify-start items-center h-screen overflow-hidden p-4">

            {matchFinished && (
                <div className="w-full max-w-3xl mb-4 bg-green-900/40 border border-green-500/50 rounded-xl p-4 text-center">
                    <p className="text-green-300 font-semibold text-lg">✅ Trận đấu đã hoàn thành</p>
                    <p className="text-green-200/70 text-sm mt-1">Các vòng thi đã kết thúc. Chỉ có thể xem kết quả.</p>
                </div>
            )}

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
        </div>
    );
};

export default GWaitingPage;