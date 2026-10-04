import React, { type ReactNode } from "react";
import { VoicePublisher } from "@/components/shared/VoicePublisher";

interface CGameShellProps {
  voiceUser?: string | null;
  children: ReactNode;
}

export const CGameShell: React.FC<CGameShellProps> = ({
  voiceUser,
  children,
}) => {
  return (
    <div className="flex flex-col h-full min-h-0">
      {voiceUser ? <VoicePublisher userCode={voiceUser} /> : null}
      {children}
    </div>
  );
};

export default CGameShell;
