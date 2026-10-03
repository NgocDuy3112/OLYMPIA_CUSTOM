import { useNavigate } from "react-router-dom";
import { CalendarDays, Flag, MapPin, Pencil } from "lucide-react";
import { setMatchCode as persistMatchCode } from "@/utils/storage";
import { formatScheduleTime } from "./scheduleUtils";
import { Button } from "@/components/ui/button";
import type { MatchData } from "./gameTypes";

export interface SlotPlayer {
  userCode: string;
  userName?: string;
  position?: number | null;
}

function StatusBadge({ status }: { status?: string }) {
  if (status === "finished" || status === "completed")
    return (
      <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-medium bg-success/20 text-success">
        Hoàn thành
      </span>
    );
  if (status === "active" || status === "in_progress" || status === "paused")
    return (
      <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-medium bg-warning/20 text-warning">
        {status}
      </span>
    );
  return (
    <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-medium bg-primary/20 text-brand">
      {status ?? "—"}
    </span>
  );
}

function Slot({ position, player }: { position: number; player?: SlotPlayer }) {
  if (!player) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-dashed border-border text-muted-foreground/70">
        <span className="w-5 h-5 shrink-0 rounded-full bg-accent/50 text-[10px] font-mono flex items-center justify-center">
          {position}
        </span>
        <span className="text-[11px]">Trống</span>
      </div>
    );
  }
  const name = player.userName || player.userCode;
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-accent/25 border border-border min-w-0">
      <span className="w-5 h-5 shrink-0 rounded-full bg-primary/30 text-brand text-[10px] font-mono flex items-center justify-center">
        {position}
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-foreground truncate">{name}</span>
        {player.userName && (
          <span className="block text-[10px] text-muted-foreground font-mono truncate">{player.userCode}</span>
        )}
      </span>
    </div>
  );
}

interface ScheduleMatchCardProps {
  match: MatchData;
  players: SlotPlayer[];
  selected: boolean;
  onSelect: (code: string) => void;
  onFinish: (m: MatchData) => void;
}

/** Một ô lịch: card trận với 4 slot thí sinh. */
export function ScheduleMatchCard({ match, players, selected, onSelect, onFinish }: ScheduleMatchCardProps) {
  const navigate = useNavigate();
  const done = match.match_status === "finished" || match.match_status === "completed";
  const byPos = (pos: number) =>
    players.find((p) => (p.position ?? 0) === pos) ?? players[pos - 1];

  const handleEnter = (e: React.MouseEvent) => {
    e.stopPropagation();
    persistMatchCode(match.match_code);
    navigate(`/operator/controller/waiting/${match.match_code}`);
  };

  return (
    <div
      onClick={() => onSelect(match.match_code)}
      className={`flex flex-col gap-2.5 p-3.5 rounded-xl border cursor-pointer transition-colors ${
        selected
          ? "bg-primary/10 border-primary/50"
          : "bg-accent/25 border-border hover:bg-accent/50 hover:border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {match.match_label && (
            <span className="shrink-0 px-1.5 py-0.5 rounded bg-role-admin/20 border border-role-admin/30 text-role-admin text-[11px] font-mono font-bold">
              {match.match_label}
            </span>
          )}
          <StatusBadge status={match.match_status} />
        </div>
        <span className="text-[11px] text-muted-foreground/70 font-mono shrink-0">{match.match_code}</span>
      </div>

      <p className="font-semibold text-foreground leading-snug">{match.match_name}</p>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarDays size={13} className="shrink-0 text-muted-foreground" />
          {formatScheduleTime(match.scheduled_at)}
        </span>
        {match.venue && (
          <span className="flex items-center gap-1.5">
            <MapPin size={13} className="shrink-0 text-muted-foreground" />
            <span className="truncate">{match.venue}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {[1, 2, 3, 4].map((pos) => (
          <Slot key={pos} position={pos} player={byPos(pos)} />
        ))}
      </div>

      <div className="flex gap-1.5 mt-0.5" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="secondary"
          onClick={() => onSelect(match.match_code)}
          className="flex-1 justify-center gap-1 bg-accent/50 border border-border hover:bg-accent text-xs"
          title="Chọn để sửa / xem câu hỏi"
        >
          <Pencil size={12} /> Sửa
        </Button>
        <Button
          variant="default"
          onClick={handleEnter}
          disabled={done}
          className="flex-1 disabled:opacity-40 text-xs font-medium"
          title="Mở phòng điều khiển"
        >
          Vào trận
        </Button>
        {!done && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onFinish(match)}
            className="bg-success/20 border border-success/30 text-success hover:bg-success/40"
            title="Hoàn thành (PUT matchStatus=finished)"
          >
            <Flag size={12} />
          </Button>
        )}
      </div>
    </div>
  );
}

export default ScheduleMatchCard;
