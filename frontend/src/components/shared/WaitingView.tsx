import PPlayerRec from "@/components/player/PPlayerRec";
import type { PlayerStatus } from "@/types/player";
import ScoreChart from "@/components/shared/ScoreChart";

interface WaitingViewProps {
  matchCode: string;
  matchName: string;
  players: PlayerStatus[];
  loaded: boolean;
  matchFinished: boolean;
  currentPlayerCode?: string;
  finishedMessage: string;
  chartData: Record<string, { question_code: string; points: number; cumulative_score: number }[]>;
}

export function WaitingView({
  matchName,
  players,
  loaded,
  matchFinished,
  currentPlayerCode,
  finishedMessage,
  chartData,
}: WaitingViewProps) {
  return (
    <div className="flex flex-col justify-start items-center h-screen overflow-hidden p-4">
      {matchFinished ? (
        <div className="w-full max-w-3xl mb-4 bg-green-900/40 border border-green-500/50 rounded-xl p-4 text-center">
          <p className="text-green-300 font-semibold text-lg">✅ Trận đấu đã hoàn thành</p>
          <p className="text-green-200/70 text-sm mt-1">{finishedMessage}</p>
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

      {Object.keys(chartData).length > 0 ? <ScoreChart players={players} chartData={chartData} /> : null}

      {loaded && players.length > 0 ? (
        <div className="flex gap-4 max-w-7xl w-full justify-center mt-8">
          {players.map((player) => (
            <PPlayerRec
              key={player.playerCode}
              player={player}
              isCurrent={player.playerCode === currentPlayerCode}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
