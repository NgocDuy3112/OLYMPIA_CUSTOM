import { useNavigate } from "react-router-dom";
import { CalendarDays, Flag, MapPin, Pencil } from "lucide-react";
import { setMatchCode as persistMatchCode } from "@/utils/storage";
import { formatScheduleTime } from "./scheduleUtils";
import type { MatchData } from "./gameTypes";

export interface SlotPlayer {
  userCode: string;
  userName?: string;
  position?: number | null;
}

function StatusBadge({ status }: { status?: string }) {
  if (status === "finished" || status === "completed")
    return (
      <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-medium bg-green-600/20 text-green-300">
        Hoàn thành
      </span>
    );
  if (status === "active" || status === "in_progress" || status === "paused")
    return (
      <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-600/20 text-amber-300">
        {status}
      </span>
    );
  return (
    <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-600/20 text-blue-300">
      {status ?? "—"}
    </span>
  );
}

function Slot({ position, player }: { position: number; player?: SlotPlayer }) {
  if (!player) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-dashed border-white/10 text-gray-600">
        <span className="w-5 h-5 shrink-0 rounded-full bg-white/5 text-[10px] font-mono flex items-center justify-center">
          {position}
        </span>
        <span className="text-[11px]">Trống</span>
      </div>
    );
  }
  const name = player.userName || player.userCode;
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 min-w-0">
      <span className="w-5 h-5 shrink-0 rounded-full bg-blue-600/30 text-blue-200 text-[10px] font-mono flex items-center justify-center">
        {position}
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-white truncate">{name}</span>
        {player.userName && (
          <span className="block text-[10px] text-gray-500 font-mono truncate">{player.userCode}</span>
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
          ? "bg-blue-600/10 border-blue-500/50"
          : "bg-white/[0.03] border-white/10 hover:bg-white/5 hover:border-white/20"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {match.match_label && (
            <span className="shrink-0 px-1.5 py-0.5 rounded bg-purple-600/20 border border-purple-500/30 text-purple-300 text-[11px] font-mono font-bold">
              {match.match_label}
            </span>
          )}
          <StatusBadge status={match.match_status} />
        </div>
        <span className="text-[11px] text-gray-600 font-mono shrink-0">{match.match_code}</span>
      </div>

      <p className="font-semibold text-white leading-snug">{match.match_name}</p>

      <div className="flex flex-col gap-1 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <CalendarDays size={13} className="shrink-0 text-gray-500" />
          {formatScheduleTime(match.scheduled_at)}
        </span>
        {match.venue && (
          <span className="flex items-center gap-1.5">
            <MapPin size={13} className="shrink-0 text-gray-500" />
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
        <button
          onClick={() => onSelect(match.match_code)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs transition-colors"
          title="Chọn để sửa / xem câu hỏi"
        >
          <Pencil size={12} /> Sửa
        </button>
        <button
          onClick={handleEnter}
          disabled={done}
          className="flex-1 px-2 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-medium transition-colors"
          title="Mở phòng điều khiển"
        >
          Vào trận
        </button>
        {!done && (
          <button
            onClick={() => onFinish(match)}
            className="px-2 py-1.5 rounded-lg bg-green-600/20 border border-green-500/30 text-green-300 hover:bg-green-600/40 text-xs transition-colors"
            title="Hoàn thành (PUT matchStatus=finished)"
          >
            <Flag size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

export default ScheduleMatchCard;
