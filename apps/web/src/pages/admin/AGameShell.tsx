/**
 * AGameShell — Common admin game page skeleton.
 *
 * Shared root used by ABasePageLayout / ANewBaseLayout / AVeDichPickLayout:
 * full-height column + optional MC voice publisher + gameplay nav bar.
 */
import React, { type ReactNode } from "react";
import AdminGameplayNavBar from "@/navigation/ANavBar";
import { VoicePublisher } from "@/components/shared/VoicePublisher";

interface AGameShellProps {
  /** User code to publish MC voice for (omit to disable). */
  voiceUser?: string | null;
  /** Render the gameplay nav bar (default true). */
  nav?: boolean;
  children: ReactNode;
}

export const AGameShell: React.FC<AGameShellProps> = ({
  voiceUser,
  nav = true,
  children,
}) => {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {voiceUser ? <VoicePublisher userCode={voiceUser} /> : null}
      {nav && <AdminGameplayNavBar />}
      {children}
    </div>
  );
};

export default AGameShell;
