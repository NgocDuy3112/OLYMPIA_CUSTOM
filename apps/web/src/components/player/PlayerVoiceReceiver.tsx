import { Volume2, VolumeX } from "lucide-react";
import { useWebRTCVoiceViewer } from "@/hooks/useWebRTCCamera";
export function PlayerVoiceReceiver({
  publisherCode,
}: {
  publisherCode: string;
}) {
  const { muted, setMuted } = useWebRTCVoiceViewer(publisherCode);
  return (
    <button
      type="button"
      onClick={() => setMuted((value) => !value)}
      className="fixed bottom-3 right-3 z-40 rounded-lg bg-blue-900/90 p-2 text-white shadow"
      title={muted ? "Bật tiếng MC" : "Tắt tiếng MC"}
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}
