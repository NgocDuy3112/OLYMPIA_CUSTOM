import React from "react";
import { useDriveMedia } from "@/hooks/useDriveMedia";

interface RenderMediaProps {
    mediaUrl: string | undefined;
}

const MEDIA_CLASS = "object-contain w-full h-full";
const CONTAINER_CLASS = "py-4 flex justify-center pb-1";

function resolveMediaElement(src: string, mimeType: string | null | undefined): React.ReactNode {
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
                <video controls src={src} className={MEDIA_CLASS}>
                    Trình duyệt của bạn không hỗ trợ video.
                </video>
            </div>
        );
    }

    return null;
}

export const RenderMedia: React.FC<RenderMediaProps> = ({ mediaUrl }) => {
    // Try admin token first (localStorage), then player token (sessionStorage).
    const token =
        localStorage.getItem("jwtToken_admin") ??
        sessionStorage.getItem("jwtToken_player") ??
        sessionStorage.getItem("jwtToken_mc") ??
        "";

    const driveMedia = useDriveMedia(mediaUrl, token);

    if (!mediaUrl) return null;

    if (driveMedia.loading) {
        return (
            <div className={CONTAINER_CLASS}>
                <div className="text-blue-300 text-sm animate-pulse">Đang tải media…</div>
            </div>
        );
    }
    if (driveMedia.error) {
        return (
            <div className={CONTAINER_CLASS}>
                <div className="text-red-400 text-sm text-center">Không tải được media</div>
            </div>
        );
    }
    if (!driveMedia.blobUrl) return null;
    return <>{resolveMediaElement(driveMedia.blobUrl, driveMedia.mimeType)}</>;
};