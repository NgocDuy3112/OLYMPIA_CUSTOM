import React from "react";
import { Camera, CameraOff, Mic, MicOff } from "lucide-react";
import { motion } from "framer-motion";

interface PlayerMediaStatusProps {
  cameraEnabled: boolean;
  micEnabled: boolean;
  onToggleCamera?: () => void;
  onToggleMic?: () => void;
  showControls?: boolean;
  size?: "sm" | "md" | "lg";
}

const SIZE_STYLES = {
  sm: {
    container: "gap-1",
    icon: 12,
    button: "w-6 h-6",
  },
  md: {
    container: "gap-1.5",
    icon: 14,
    button: "w-7 h-7",
  },
  lg: {
    container: "gap-2",
    icon: 16,
    button: "w-8 h-8",
  },
};

export const PlayerMediaStatus: React.FC<PlayerMediaStatusProps> = ({
  cameraEnabled,
  micEnabled,
  onToggleCamera,
  onToggleMic,
  showControls = false,
  size = "md",
}) => {
  const styles = SIZE_STYLES[size];

  return (
    <div className={`flex items-center ${styles.container}`}>
      {/* Camera status */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`
          flex items-center justify-center rounded-full
          ${
            cameraEnabled
              ? "bg-green-500/20 text-green-400"
              : "bg-red-500/20 text-red-400"
          }
          ${showControls ? "cursor-pointer hover:opacity-80" : ""}
          ${styles.button}
        `}
        onClick={showControls ? onToggleCamera : undefined}
        title={cameraEnabled ? "Camera đang bật" : "Camera đã tắt"}
      >
        {cameraEnabled ? (
          <Camera size={styles.icon} />
        ) : (
          <CameraOff size={styles.icon} />
        )}
      </motion.div>

      {/* Mic status */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.05 }}
        className={`
          flex items-center justify-center rounded-full
          ${
            micEnabled
              ? "bg-green-500/20 text-green-400"
              : "bg-red-500/20 text-red-400"
          }
          ${showControls ? "cursor-pointer hover:opacity-80" : ""}
          ${styles.button}
        `}
        onClick={showControls ? onToggleMic : undefined}
        title={micEnabled ? "Mic đang bật" : "Mic đã tắt"}
      >
        {micEnabled ? <Mic size={styles.icon} /> : <MicOff size={styles.icon} />}
      </motion.div>
    </div>
  );
};

export default PlayerMediaStatus;
