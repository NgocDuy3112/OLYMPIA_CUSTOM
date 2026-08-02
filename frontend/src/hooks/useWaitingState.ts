import { useEffect, useState } from "react";
import type { PlayerStatus } from "@/types/player";
import type { WebSocketMessage } from "@/types/websocket";
import { unwrapWebSocketMessage } from "@/types/websocket";
import type { RawPlayer, RawProfile, RawScore } from "@/utils/playerHelpers";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";

const toArray = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

export function useWaitingState(lastMessage: WebSocketMessage | null) {
  const [matchName, setMatchName] = useState("");
  const [players, setPlayers] = useState<PlayerStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [matchFinished, setMatchFinished] = useState(false);
  const [chartData, setChartData] = useState<Record<string, { question_code: string; points: number; cumulative_score: number }[]>>({});
  const [questionLabels, setQuestionLabels] = useState<string[]>([]);
  const [showChart, setShowChart] = useState(false);

  useEffect(() => {
    const message = unwrapWebSocketMessage(lastMessage);
    if (!message) return;
    let active = true;

    queueMicrotask(() => {
      if (!active) return;
      switch (message.type) {
        case "send_room_info":
          setMatchName(typeof message.match_name === "string" ? message.match_name : "");
          setMatchFinished(message.match_status === "finished");
          setLoaded(true);
          break;
        case "send_players_info":
          setPlayers((previous) => buildPlayersSnapshot(
            toArray<RawPlayer>(message.players),
            toArray<RawScore>(message.scoreboard),
            toArray<RawProfile>(message.profiles),
            previous,
          ));
          setLoaded(true);
          break;
        case "show_scoreboard":
          setShowChart(true);
          break;
        case "score_chart_snapshot":
          setShowChart(true);
          if (Array.isArray(message.question_labels)) setQuestionLabels(message.question_labels.map(String));
          if (message.chart_data && typeof message.chart_data === "object") {
            setChartData(message.chart_data as Record<string, { question_code: string; points: number; cumulative_score: number }[]>);
          }
          if (Array.isArray(message.scoreboard)) {
            setPlayers((previous) => buildPlayersSnapshot([], toArray<RawScore>(message.scoreboard), [], previous));
          }
          break;
        case "player_score_updated":
          if (
            (typeof message.user_code === "string" || typeof message.user_code === "number") &&
            typeof message.new_total_score === "number"
          ) {
            const userCode = String(message.user_code);
            const score = message.new_total_score;
            setPlayers((previous) => previous.map((player) =>
              player.playerCode === userCode ? { ...player, playerScore: score } : player,
            ));
          }
          break;
        case "finish_match":
          setMatchFinished(true);
          break;
      }
    });

    return () => {
      active = false;
    };
  }, [lastMessage]);

  return { matchName, players, setPlayers, loaded, matchFinished, setMatchFinished, chartData, questionLabels, showChart };
}
