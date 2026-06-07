import React, { useEffect, useRef } from "react";
import { useS3Media } from "@/hooks/useS3Media";

interface RenderMediaProps {
    mediaUrl: string | undefined;
    videoPlayState?: "playing" | "paused" | null;
}

const MEDIA_CLASS = "object-contain max-w-full max-h-full";
const CONTAINER_CLASS = "h-full flex items-center justify-center";

const VideoElement: React.FC<{ src: string; className: string; playState?: "playing" | "paused" | null }> = ({ src, className, playState }) => {
    const ref = useRef<HTMLVideoElement>(null);
    const playStateRef = useRef<"playing" | "paused" | null>(playState ?? null);
    const [autoplayBlocked, setAutoplayBlocked] = React.useState(false);

    const attemptPlay = React.useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.muted = false;
        const p = el.play();
        if (p && typeof p.catch === "function") {
            p.then(() => {
                setAutoplayBlocked(false);
            }).catch((err) => {
                console.warn("[RenderMedia] play() rejected (autoplay with audio blocked):", err);
                setAutoplayBlocked(true);
            });
        } else {
            setAutoplayBlocked(false);
        }
    }, []);

    useEffect(() => {
        playStateRef.current = playState ?? null;
        const el = ref.current;
        if (!el) return;

        if (playState === "playing") {
            // Always play unmuted so the room hears the question audio. Browsers may
            // block unmuted autoplay until the user interacts with the page. When that
            // happens we surface an "Nhấp để bật âm thanh" overlay AND listen for the
            // next user gesture to retry.
            el.muted = false;
            if (el.readyState >= 2 /* HAVE_CURRENT_DATA */) {
                attemptPlay();
            } else {
                const onCanPlay = () => {
                    el.removeEventListener("canplay", onCanPlay);
                    if (playStateRef.current === "playing") attemptPlay();
                };
                el.addEventListener("canplay", onCanPlay);
            }
        } else if (playState === "paused") {
            el.pause();
        }
    }, [playState, src, attemptPlay]);

    // If the src changes mid-play, kick playback off again with the new source.
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const onLoaded = () => {
            if (playStateRef.current === "playing") {
                el.muted = false;
                el.play().catch(() => {});
            }
        };
        el.addEventListener("loadeddata", onLoaded);
        return () => el.removeEventListener("loadeddata", onLoaded);
    }, [src]);

    // Listen for the very next user gesture (click/tap/keypress anywhere) and retry
    // playback. Browsers treat this gesture as the unlock signal for unmuted autoplay.
    useEffect(() => {
        if (!autoplayBlocked) return;
        const handler = () => {
            attemptPlay();
        };
        // Pointerdown + keydown catches both mouse/touch and keyboard input.
        document.addEventListener("pointerdown", handler, { once: true });
        document.addEventListener("keydown", handler, { once: true });
        return () => {
            document.removeEventListener("pointerdown", handler);
            document.removeEventListener("keydown", handler);
        };
    }, [autoplayBlocked, attemptPlay]);

    const handleOverlayClick = () => {
        attemptPlay();
    };

    return (
        <div className="relative h-full w-full flex items-center justify-center">
            <video
                ref={ref}
                src={src}
                className={className}
                // Explicitly keep audio enabled (default is true, but pin it so future
                // refactors can't accidentally mute the question clip).
                muted={false}
                playsInline
                // Start the clip at the beginning every time a new src loads.
                onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0; }}
            >
                Trình duyệt của bạn không hỗ trợ video.
            </video>
            {autoplayBlocked && (
                <button
                    type="button"
                    onClick={handleOverlayClick}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white px-4 py-3 rounded-lg hover:bg-black/70 transition-colors"
                    aria-label="Nhấp để bật âm thanh và phát video"
                >
                    <span className="text-2xl">🔊</span>
                    <span className="text-sm sm:text-base font-bold text-center">
                        Nhấp để bật âm thanh
                    </span>
                </button>
            )}
        </div>
    );
};

function resolveMediaElement(src: string, mimeType: string | null | undefined, videoPlayState?: "playing" | "paused" | null): React.ReactNode {
    const type = mimeType ?? "";
    const urlLower = src.toLowerCase();

    const isImage =
        type.startsWith("image/") ||
        /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/.test(urlLower);
    const isAudio =
        type.startsWith("audio/") ||
        /\.(mp3|ogg|wav|aac|m4a|flac)(\?.*)?$/.test(urlLower);
    const isVideo =
        type.startsWith("video/") ||
        /\.(mp4|webm|ogv|mov)(\?.*)?$/.test(urlLower);

    if (isImage) {
        return (
            <div className={CONTAINER_CLASS}>
                <img src={src} alt="Hình ảnh" className={MEDIA_CLASS} />
            </div>
        );
    }

    if (isAudio) {
        return (
            <div className={CONTAINER_CLASS}>
                <audio controls src={src} className="w-full">
                    Trình duyệt của bạn không hỗ trợ audio.
                </audio>
            </div>
        );
    }

    if (isVideo) {
        return (
            <div className={CONTAINER_CLASS}>
                <VideoElement src={src} className={MEDIA_CLASS} playState={videoPlayState} />
            </div>
        );
    }

    return null;
}

export const RenderMedia: React.FC<RenderMediaProps> = ({ mediaUrl, videoPlayState }) => {
    // Try admin token first (localStorage), then player token (sessionStorage).
    const token =
        localStorage.getItem("jwtToken_admin") ??
        sessionStorage.getItem("jwtToken_player") ??
        sessionStorage.getItem("jwtToken_mc") ??
        "";

    const s3Media = useS3Media(mediaUrl, token);

    if (!mediaUrl) return null;

    if (s3Media.loading) {
        return (
            <div className={CONTAINER_CLASS}>
                <div className="text-blue-300 text-sm animate-pulse">Đang tải media…</div>
            </div>
        );
    }
    if (s3Media.error) {
        return (
            <div className={CONTAINER_CLASS}>
                <div className="text-red-400 text-sm text-center">Không tải được media</div>
            </div>
        );
    }
    if (!s3Media.src) return null;
    return <>{resolveMediaElement(s3Media.src, s3Media.mimeType, videoPlayState)}</>;
};