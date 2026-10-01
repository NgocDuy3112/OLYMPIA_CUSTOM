import { useState } from "react";
import { Volume2, VolumeX, Camera, CameraOff } from "lucide-react";
import { motion } from "framer-motion";
import type { ComponentProps } from "react";
import type { PlayerStatus } from "@/types/player";
import CPlayerBar from "@/components/controller/CPlayerBar";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CameraVideo } from "./CameraVideo";
import { useWebRTCCameraViewer } from "@/hooks/useWebRTCCamera";

export function PlayerPanel(
  props: ComponentProps<typeof CPlayerBar> & {
    player: PlayerStatus;
    showCameraControl?: boolean;
    onCameraControl?: (playerCode: string, enabled: boolean) => void;
  },
) {
  const { stream } = useWebRTCCameraViewer(props.player.playerCode);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [cameraRequested, setCameraRequested] = useState(true);
  return (
    <div className="overflow-hidden rounded-lg bg-background shadow-lg">
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
              ${stream ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}
            `}
            title={stream ? "Camera đang bật" : "Camera đã tắt"}
          >
            {stream ? <Camera size={12} /> : <CameraOff size={12} />}
          </motion.div>
        </div>

        {/* Mute button */}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => setMuted((value) => !value)}
          className="absolute right-2 top-2 rounded bg-background/60 text-foreground hover:bg-background/80"
          title={muted ? "Bật tiếng" : "Tắt tiếng"}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </Button>

        {/* Controller camera control */}
        {props.showCameraControl && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              const next = !cameraRequested;
              setCameraRequested(next);
              props.onCameraControl?.(props.player.playerCode, next);
            }}
            className={`absolute bottom-2 right-2 text-foreground ${cameraRequested ? "bg-success/80 hover:bg-success" : "bg-destructive/80 hover:bg-destructive"}`}
            title={cameraRequested ? "Yêu cầu tắt camera" : "Yêu cầu bật camera"}
          >
            {cameraRequested ? <Camera size={16} /> : <CameraOff size={16} />}
          </Button>
        )}
      </div>
      <div
        className="flex items-center gap-2 bg-background px-2 py-1"
        onClick={(event) => event.stopPropagation()}
      >
        <VolumeX size={13} className="text-foreground/60" />
        <Slider
          aria-label={`Âm lượng ${props.player.playerName}`}
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onValueChange={(next) => {
            const n = Array.isArray(next) ? next[0] : next;
            setVolume(n);
            setMuted(false);
          }}
          className="w-full"
        />
        <Volume2 size={13} className="text-foreground/60" />
      </div>
      <CPlayerBar {...props} />
    </div>
  );
}
