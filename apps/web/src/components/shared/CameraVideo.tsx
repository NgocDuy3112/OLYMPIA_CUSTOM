import { useEffect, useRef } from "react";

export function CameraVideo({
  stream,
  label,
  muted = true,
  volume = 1,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  volume?: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.volume = volume;
    }
  }, [stream, volume]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-t-lg bg-black">
      {stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-white/50">
          Camera chưa kết nối
        </div>
      )}
      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {label}
      </span>
    </div>
  );
}
