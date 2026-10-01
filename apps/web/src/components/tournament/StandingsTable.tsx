import React from "react";
import { Trophy, Medal } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      <div className="text-center py-12 text-muted-foreground">
        <Trophy size={40} className="mx-auto mb-3 opacity-50" />
        <p>Chưa có kết quả</p>
      </div>
    );
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Medal size={18} className="text-warning" />;
      case 2:
        return <Medal size={18} className="text-foreground" />;
      case 3:
        return <Medal size={18} className="text-warning" />;
      default:
        return <span className="text-muted-foreground w-[18px] text-center">{rank}</span>;
    }
  };

  return (
    <Table className="w-full text-sm">
      <TableHeader>
        <TableRow className="border-b border-border hover:bg-transparent">
          <TableHead className="w-12 py-3 px-3 text-muted-foreground font-medium">
            #
          </TableHead>
          <TableHead className="py-3 px-3 text-muted-foreground font-medium">
            Thí sinh
          </TableHead>
          <TableHead className="py-3 px-3 text-right text-muted-foreground font-medium">
            Điểm
          </TableHead>
          {showMatchesPlayed && (
            <TableHead className="py-3 px-3 text-right text-muted-foreground font-medium">
              Trận
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {standings.map((standing) => (
          <TableRow
            key={standing.userId}
            className="border-b border-border/50 hover:bg-accent/50"
          >
            <TableCell className="py-3 px-3">
              <div className="flex items-center">{getRankIcon(standing.rank)}</div>
            </TableCell>
            <TableCell className="py-3 px-3">
              <span className="font-medium text-foreground">
                {standing.userName}
              </span>
            </TableCell>
            <TableCell className="py-3 px-3 text-right">
              <span className="font-bold text-brand">
                {standing.score.toLocaleString()}
              </span>
            </TableCell>
            {showMatchesPlayed && (
              <TableCell className="py-3 px-3 text-right text-muted-foreground">
                {standing.matchesPlayed}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
