/**
 * CGameShell — Common controller game page skeleton.
 *
 * Shared root used by CBasePageLayout / CNewBaseLayout / CVeDichPickLayout:
 * full-height column + optional MC voice publisher + gameplay nav bar.
 */
import React, { type ReactNode } from "react";
import ControllerGameplayNavBar from "@/navigation/CNavBar";
import { VoicePublisher } from "@/components/shared/VoicePublisher";

interface CGameShellProps {
  /** User code to publish MC voice for (omit to disable). */
  voiceUser?: string | null;
  /** Render the gameplay nav bar (default true). */
  nav?: boolean;
  children: ReactNode;
}

export const CGameShell: React.FC<CGameShellProps> = ({
  voiceUser,
  nav = true,
  children,
}) => {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {voiceUser ? <VoicePublisher userCode={voiceUser} /> : null}
      {nav && <ControllerGameplayNavBar />}
      {children}
    </div>
  );
};

export default CGameShell;
