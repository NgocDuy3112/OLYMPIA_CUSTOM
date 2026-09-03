import { useState } from "react";
import { Volume2, VolumeX, Camera, CameraOff } from "lucide-react";
import { motion } from "framer-motion";
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
        {/* Camera status indicator */}
        <div className="absolute left-2 top-2">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`
              flex items-center justify-center w-6 h-6 rounded-full
              ${stream ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}
            `}
            title={stream ? "Camera đang bật" : "Camera đã tắt"}
          >
            {stream ? <Camera size={12} /> : <CameraOff size={12} />}
          </motion.div>
        </div>

        {/* Mute button */}
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
