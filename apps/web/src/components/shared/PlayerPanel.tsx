import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import type { ComponentProps } from "react";
import type { PlayerStatus } from "@/types/player";
import APlayerBar from "@/components/admin/APlayerBar";
import { CameraVideo } from "./CameraVideo";
import { useWebRTCCameraViewer } from "@/hooks/useWebRTCCamera";

export function PlayerPanel(
  props: ComponentProps<typeof APlayerBar> & { player: PlayerStatus },
) {
  const { stream } = useWebRTCCameraViewer(props.player.playerCode);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  return (
    <div className="overflow-hidden rounded-lg bg-blue-950 shadow-lg">
      <div className="relative" onClick={(event) => event.stopPropagation()}>
        <CameraVideo
          stream={stream}
          label={props.player.playerName}
          muted={muted}
          volume={volume}
        />
        <button
          type="button"
          onClick={() => setMuted((value) => !value)}
          className="absolute right-2 top-2 rounded bg-black/60 p-1.5 text-white hover:bg-black/80"
          title={muted ? "Bật tiếng" : "Tắt tiếng"}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>
      <div
        className="flex items-center gap-2 bg-blue-950 px-2 py-1"
        onClick={(event) => event.stopPropagation()}
      >
        <VolumeX size={13} className="text-white/60" />
        <input
          aria-label={`Âm lượng ${props.player.playerName}`}
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={muted ? 0 : volume}
          onChange={(event) => {
            setVolume(Number(event.target.value));
            setMuted(false);
          }}
          className="w-full accent-blue-400"
        />
        <Volume2 size={13} className="text-white/60" />
      </div>
      <APlayerBar {...props} />
    </div>
  );
}
