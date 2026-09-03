import React from "react";
import { Trophy, Medal } from "lucide-react";

interface Standing {
  rank: number;
  userId: string;
  userName: string;
  score: number;
  matchesPlayed: number;
}

interface StandingsTableProps {
  standings: Standing[];
  showMatchesPlayed?: boolean;
}

export const StandingsTable: React.FC<StandingsTableProps> = ({
  standings,
  showMatchesPlayed = true,
}) => {
  if (standings.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Trophy size={40} className="mx-auto mb-3 opacity-50" />
        <p>Chưa có kết quả</p>
      </div>
    );
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Medal size={18} className="text-yellow-400" />;
      case 2:
        return <Medal size={18} className="text-gray-300" />;
      case 3:
        return <Medal size={18} className="text-orange-400" />;
      default:
        return <span className="text-gray-400 w-[18px] text-center">{rank}</span>;
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            <th className="text-left py-3 px-3 text-gray-400 font-medium w-12">
              #
            </th>
            <th className="text-left py-3 px-3 text-gray-400 font-medium">
              Thí sinh
            </th>
            <th className="text-right py-3 px-3 text-gray-400 font-medium">
              Điểm
            </th>
            {showMatchesPlayed && (
              <th className="text-right py-3 px-3 text-gray-400 font-medium">
                Trận
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {standings.map((standing) => (
            <tr
              key={standing.userId}
              className="border-b border-white/5 hover:bg-white/5"
            >
              <td className="py-3 px-3">
                <div className="flex items-center">{getRankIcon(standing.rank)}</div>
              </td>
              <td className="py-3 px-3">
                <span className="font-medium text-white">
                  {standing.userName}
                </span>
              </td>
              <td className="py-3 px-3 text-right">
                <span className="font-bold text-blue-400">
                  {standing.score.toLocaleString()}
                </span>
              </td>
              {showMatchesPlayed && (
                <td className="py-3 px-3 text-right text-gray-400">
                  {standing.matchesPlayed}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
