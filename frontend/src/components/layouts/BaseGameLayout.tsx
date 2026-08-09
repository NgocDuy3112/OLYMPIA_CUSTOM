import React from "react";
import { HeaderBar } from "./HeaderBar";
import { PhaseNavigation } from "./PhaseNavigation";

interface BaseGameLayoutProps {
  matchCode: string;
  phase?: string;
  phaseName?: string;
  isConnected: boolean;
  showPhaseNav?: boolean;
  disabled?: boolean;
  headerRightContent?: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
}

export const BaseGameLayout: React.FC<BaseGameLayoutProps> = ({
  matchCode,
  phase,
  phaseName,
  isConnected,
  showPhaseNav = true,
  disabled = false,
  headerRightContent,
  sidebar,
  children,
}) => {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <HeaderBar
        matchCode={matchCode}
        phase={phase}
        phaseName={phaseName}
        isConnected={isConnected}
        rightContent={headerRightContent}
      />

      {/* Phase Navigation */}
      {showPhaseNav && phase && (
        <PhaseNavigation
          matchCode={matchCode}
          currentPhase={phase}
          disabled={disabled}
        />
      )}

      {/* Main Content */}
      <div className="flex flex-row flex-1 overflow-hidden">
        {/* Content area */}
        <div className="flex flex-col flex-1 overflow-y-auto p-4">
          {children}
        </div>

        {/* Sidebar (optional) */}
        {sidebar && (
          <div className="flex flex-col w-80 border-l border-white/10 bg-black/20 overflow-y-auto p-4">
            {sidebar}
          </div>
        )}
      </div>
    </div>
  );
};
