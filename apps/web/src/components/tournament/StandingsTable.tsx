import React from "react";
import { Trophy, Medal } from "lucide-react";
import {
  DataTable,
} from "@/components/shared/data-table";
import {
  createDataTableColumns,
  type DataTableColumn,
} from "@/components/shared/data-table-core";

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

const helper = createDataTableColumns<Standing>();

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1:
      return <Medal size={18} className="text-warning" />;
    case 2:
      return <Medal size={18} className="text-foreground" />;
    case 3:
      return <Medal size={18} className="text-warning" />;
    default:
      return (
        <span className="text-muted-foreground w-[18px] text-center">{rank}</span>
      );
  }
};

export const StandingsTable: React.FC<StandingsTableProps> = ({
  standings,
  showMatchesPlayed = true,
}) => {
  const columns = React.useMemo(() => {
    const cols: DataTableColumn<Standing>[] = [
      helper.accessor("rank", {
        header: "#",
        cell: (info) => (
          <div className="flex items-center">{getRankIcon(info.getValue())}</div>
        ),
      }),
      helper.accessor("userName", {
        header: "Thí sinh",
        cell: (info) => (
          <span className="font-medium text-foreground">{info.getValue()}</span>
        ),
      }),
      helper.accessor("score", {
        header: "Điểm",
        cell: (info) => (
          <span className="block text-right font-bold text-brand">
            {info.getValue().toLocaleString()}
          </span>
        ),
      }),
    ];
    if (showMatchesPlayed) {
      cols.push(
        helper.accessor("matchesPlayed", {
          header: "Trận",
          cell: (info) => (
            <span className="block text-right text-muted-foreground">
              {info.getValue()}
            </span>
          ),
        }),
      );
    }
    return cols;
  }, [showMatchesPlayed]);

  if (standings.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Trophy size={40} className="mx-auto mb-3 opacity-50" />
        <p>Chưa có kết quả</p>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={standings}
      emptyText="Chưa có kết quả"
    />
  );
};
