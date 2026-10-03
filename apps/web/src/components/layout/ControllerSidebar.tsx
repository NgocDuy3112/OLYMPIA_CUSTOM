import React from "react";
import {
  LayoutDashboard,
  Play,
  ClipboardCheck,
  HelpCircle,
  KeyRound,
  Gamepad2,
} from "lucide-react";
import { getMatchCode } from "@/utils/storage";
import { ShellSidebar, type ShellNavGroup } from "./ShellSidebar";

export const ControllerSidebar: React.FC = () => {
  const matchCode = getMatchCode();

  const groups: ShellNavGroup[] = [
    {
      label: "Trận đấu",
      items: [
        {
          label: "Tổng quan live",
          path: "/operator/controller/overview",
          icon: <LayoutDashboard size={18} />,
        },
        {
          label: "Sảnh chờ",
          path: matchCode ? `/operator/controller/waiting/${matchCode}` : "/operator/controller",
          icon: <Play size={18} />,
        },
        { label: "Vòng loại", path: "/operator/controller/qualifier", icon: <HelpCircle size={18} /> },
        { label: "Duyệt điểm", path: "/operator/controller/reviews", icon: <ClipboardCheck size={18} /> },
      ],
    },
    {
      label: "Hệ thống",
      items: [{ label: "MCP Tokens", path: "/operator/mcp-tokens", icon: <KeyRound size={18} /> }],
    },
  ];

  return (
    <ShellSidebar
      shellName="CONTROLLER"
      brandIcon={<Gamepad2 size={16} />}
      brandHome="/operator/controller/overview"
      accentClass="text-role-controller"
      activeClass="data-[active=true]:bg-role-controller/15 data-[active=true]:text-role-controller"
      roleLabel="Controller"
      groups={groups}
    />
  );
};
