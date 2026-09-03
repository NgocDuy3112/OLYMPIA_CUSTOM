import { useWebRTCCameraPublisher } from "@/hooks/useWebRTCCamera";
import { PlayerMediaStatus } from "./PlayerMediaStatus";

interface PlayerCameraPublisherProps {
  userCode: string;
  showStatus?: boolean;
  showControls?: boolean;
}

/** Publishes camera/microphone with optional status display. */
export function PlayerCameraPublisher({
  userCode,
  showStatus = false,
  showControls = false,
}: PlayerCameraPublisherProps) {
  const { cameraEnabled, micEnabled, toggleCamera, toggleMic } =
    useWebRTCCameraPublisher(userCode);

  if (showStatus) {
    return (
      <PlayerMediaStatus
        cameraEnabled={cameraEnabled}
        micEnabled={micEnabled}
        onToggleCamera={toggleCamera}
        onToggleMic={toggleMic}
        showControls={showControls}
      />
    );
  }

  return null;
}
