import React from "react";
import {
  Database,
  Swords,
  ListOrdered,
  Bot,
  KeyRound,
  HelpCircle,
} from "lucide-react";
import { ShellSidebar, type ShellNavGroup } from "./ShellSidebar";

/** QAuthor shell sidebar — cấu hình cho ShellSidebar (shadcn Sidebar block). */
export const QAuthorSidebar: React.FC = () => {
  const groups: ShellNavGroup[] = [
    {
      label: "Soạn câu",
      items: [
        {
          label: "Ngân hàng câu hỏi",
          path: "/operator/qauthor/bank",
          icon: <Database size={18} />,
        },
        { label: "Câu hỏi trận", path: "/operator/qauthor/match", icon: <Swords size={18} /> },
        { label: "Vòng loại", path: "/operator/qauthor/qualifier", icon: <ListOrdered size={18} /> },
        { label: "AI Agent", path: "/operator/qauthor/agent", icon: <Bot size={18} /> },
      ],
    },
    {
      label: "Hệ thống",
      items: [{ label: "MCP Tokens", path: "/operator/mcp-tokens", icon: <KeyRound size={18} /> }],
    },
  ];

  return (
    <ShellSidebar
      shellName="QAUTHOR"
      brandIcon={<HelpCircle size={16} />}
      brandHome="/operator/qauthor/bank"
      accentClass="text-role-qauthor"
      activeClass="data-[active=true]:bg-role-qauthor/15 data-[active=true]:text-role-qauthor"
      roleLabel="Question Author"
      groups={groups}
    />
  );
};
