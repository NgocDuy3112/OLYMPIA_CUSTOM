import React from "react";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import { cn } from "cn";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "purple";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  className?: string;
}

// Giữ nguyên màu cũ — className đè lớp nền mặc định của shadcn Badge.
const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: "bg-gray-500 text-white",
  success: "bg-green-500 text-white",
  warning: "bg-yellow-500 text-white",
  danger: "bg-red-500 text-white",
  info: "bg-blue-500 text-white",
  purple: "bg-purple-500 text-white",
};

const SIZE_STYLES = {
  sm: "h-4 px-1.5 text-[10px]",
  md: "h-5 px-2",
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  size = "md",
  className = "",
}) => {
  return (
    <ShadcnBadge
      className={cn(VARIANT_STYLES[variant], SIZE_STYLES[size], className)}
    >
      {children}
    </ShadcnBadge>
  );
};

// Pre-defined status badges for common use cases
export const TournamentStatusBadge: React.FC<{ status: string }> = ({
  status,
}) => {
  const variants: Record<string, BadgeVariant> = {
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
    <Badge variant={variants[status] || "default"}>
      {labels[status] || status}
    </Badge>
  );
};

export const MatchStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const variants: Record<string, BadgeVariant> = {
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
    <Badge variant={variants[status] || "default"}>
      {labels[status] || status}
    </Badge>
  );
};

export const TournamentRoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const variants: Record<string, BadgeVariant> = {
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
    <Badge variant={variants[role] || "default"}>
      {labels[role] || role}
    </Badge>
  );
};
