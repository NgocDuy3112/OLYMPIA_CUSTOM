import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

type BadgeTone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple";

const TONE_CLASS: Record<BadgeTone, string> = {
  default: "bg-muted text-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-destructive text-destructive-foreground",
  info: "bg-info text-info-foreground",
  purple: "bg-purple text-purple-foreground",
};

export function StatusBadge({
  tone = "default",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Badge className={cn(TONE_CLASS[tone], className)}>{children}</Badge>
  );
}

export const TournamentStatusBadge: React.FC<{ status: string }> = ({
  status,
}) => {
  const tones: Record<string, BadgeTone> = {
    draft: "default",
    active: "success",
    completed: "info",
    archived: "purple",
  };
  const labels: Record<string, string> = {
    draft: "Nháp",
    active: "Đang diễn ra",
    completed: "Hoàn thành",
    archived: "Lưu trữ",
  };
  return (
    <StatusBadge tone={tones[status] || "default"}>
      {labels[status] || status}
    </StatusBadge>
  );
};

export const MatchStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const tones: Record<string, BadgeTone> = {
    setup: "default",
    active: "success",
    in_progress: "warning",
    paused: "warning",
    completed: "info",
    finished: "info",
  };
  const labels: Record<string, string> = {
    setup: "Chuẩn bị",
    active: "Đang diễn ra",
    in_progress: "Đang thi",
    paused: "Tạm dừng",
    completed: "Hoàn thành",
    finished: "Kết thúc",
  };
  return (
    <StatusBadge tone={tones[status] || "default"}>
      {labels[status] || status}
    </StatusBadge>
  );
};

export const TournamentRoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const tones: Record<string, BadgeTone> = {
    controller: "purple",
    mc: "info",
    player: "success",
    spectator: "default",
  };
  const labels: Record<string, string> = {
    controller: "Điều hành",
    mc: "MC",
    player: "Thí sinh",
    spectator: "Khán giả",
  };
  return (
    <StatusBadge tone={tones[role] || "default"}>
      {labels[role] || role}
    </StatusBadge>
  );
};
