import { useState } from "react";
import PPlayerRec from "@/components/player/PPlayerRec";
import type { PlayerStatus } from "@/types/player";
import ScoreChart from "@/components/shared/ScoreChart";

const PLAYER_COLORS = ["#67E8F9", "#38BDF8", "#60A5FA", "#818CF8", "#A78BFA", "#BAE6FD"];

interface WaitingViewProps {
  matchCode: string;
  matchName: string;
  players: PlayerStatus[];
  loaded: boolean;
  matchFinished: boolean;
  currentPlayerCode?: string;
  finishedMessage: string;
  chartData: Record<string, { question_code: string; points: number; cumulative_score: number }[]>;
  questionLabels: string[];
  showChart?: boolean;
}

export function WaitingView({
  matchName,
  players,
  loaded,
  matchFinished,
  currentPlayerCode,
  chartData,
  questionLabels,
  showChart = false,
}: WaitingViewProps) {
  const [hoveredPlayerCode, setHoveredPlayerCode] = useState<string | null>(null);

  return (
    <div className="flex flex-col justify-start items-center h-screen overflow-hidden p-4">
      {matchFinished && showChart && Object.keys(chartData).length > 0 ? (
        <div className="w-full flex justify-center mb-4">
          <ScoreChart players={players} chartData={chartData} questionLabels={questionLabels} hoveredPlayerCode={hoveredPlayerCode} onPlayerHover={setHoveredPlayerCode} />
        </div>
      ) : null}

      <div className="mt-8 text-center">
        <h1 className="font-[SVN-Gratelos_Display] text-5xl font-bold text-white uppercase tracking-wide">
          OLYMPIA CUSTOM 3
        </h1>
        {loaded && matchName ? (
          <p className="mt-2 text-2xl font-semibold text-blue-300 uppercase">{matchName}</p>
        ) : null}

      </div>

      {loaded && players.length > 0 ? (
        <div className="flex gap-4 max-w-7xl w-full justify-center mt-8">
          {players.map((player, index) => (
            <PPlayerRec
              key={player.playerCode}
              player={player}
              isCurrent={player.playerCode === currentPlayerCode}
              isHovered={hoveredPlayerCode === player.playerCode}
              isDimmed={hoveredPlayerCode !== null && hoveredPlayerCode !== player.playerCode}
              onHover={setHoveredPlayerCode}
              accentColor={PLAYER_COLORS[index % PLAYER_COLORS.length]}
            />
          ))}
        </div>
      ) : null}

      {!matchFinished && showChart && Object.keys(chartData).length > 0 ? <ScoreChart players={players} chartData={chartData} questionLabels={questionLabels} hoveredPlayerCode={hoveredPlayerCode} onPlayerHover={setHoveredPlayerCode} /> : null}
    </div>
  );
}
