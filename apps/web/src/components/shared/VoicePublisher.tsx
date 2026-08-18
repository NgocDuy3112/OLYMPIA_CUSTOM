import { useWebRTCVoicePublisher } from "@/hooks/useWebRTCCamera";
export function VoicePublisher({ userCode }: { userCode: string }) {
  useWebRTCVoicePublisher(userCode);
  return null;
}
