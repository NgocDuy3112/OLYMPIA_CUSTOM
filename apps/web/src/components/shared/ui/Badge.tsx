import React from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "purple";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  className?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: "bg-gray-500",
  success: "bg-green-500",
  warning: "bg-yellow-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
  purple: "bg-purple-500",
};

const SIZE_STYLES = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2 py-0.5 text-xs",
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  size = "md",
  className = "",
}) => {
  return (
    <span
      className={`
        inline-flex items-center rounded font-medium text-white
        ${VARIANT_STYLES[variant]}
        ${SIZE_STYLES[size]}
        ${className}
      `}
    >
      {children}
    </span>
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
