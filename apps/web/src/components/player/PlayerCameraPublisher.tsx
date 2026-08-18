import { useWebRTCCameraPublisher } from "@/hooks/useWebRTCCamera";

/** Publishes camera/microphone without rendering a local preview. */
export function PlayerCameraPublisher({ userCode }: { userCode: string }) {
  useWebRTCCameraPublisher(userCode);
  return null;
}
