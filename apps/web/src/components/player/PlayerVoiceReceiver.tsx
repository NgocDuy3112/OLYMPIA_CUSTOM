import { Volume2, VolumeX } from "lucide-react";
import { useWebRTCVoiceViewer } from "@/hooks/useWebRTCCamera";
import { Button } from "@/components/ui/button";
export function PlayerVoiceReceiver({
  publisherCode,
}: {
  publisherCode: string;
}) {
  const { muted, setMuted } = useWebRTCVoiceViewer(publisherCode);
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={() => setMuted((value) => !value)}
      className="fixed bottom-3 right-3 z-40 rounded-lg bg-blue-900/90 p-2 text-white shadow"
      title={muted ? "Bật tiếng MC" : "Tắt tiếng MC"}
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </Button>
  );
}
