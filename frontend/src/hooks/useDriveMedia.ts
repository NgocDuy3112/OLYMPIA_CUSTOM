import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/configs";

const EXT_TO_MIME: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav",
    aac: "audio/aac", m4a: "audio/mp4", flac: "audio/flac",
    mp4: "video/mp4", webm: "video/webm", ogv: "video/ogg", mov: "video/quicktime",
};

function mimeFromPath(path: string): string | null {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return EXT_TO_MIME[ext] ?? null;
}

/** Returns true when the URL points to Google Drive or Google Docs. */
export function isDriveUrl(url: string): boolean {
    return url.includes("drive.google.com") || url.includes("docs.google.com");
}

/**
 * Returns true when the value looks like an S3 object key stored in the DB,
 * e.g. "OC3_M01T/clip.mp4" or "OC3_M_BP/image.jpg".
 */
export function isS3Key(url: string): boolean {
    return url.startsWith("OC3_M") && url.includes("/");
}

/**
 * Extract a Google Drive file ID from a Drive share URL.
 * Returns null if the URL does not match a known Drive pattern.
 */
export function extractDriveFileId(url: string): string | null {
    // https://drive.google.com/file/d/{FILE_ID}/view
    const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
    if (fileMatch) return fileMatch[1];

    // https://drive.google.com/open?id={FILE_ID}  or  ...&id={FILE_ID}
    const queryMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (queryMatch) return queryMatch[1];

    return null;
}

/**
 * Returns true when the value looks like a Drive share URL (not a plain filename).
 */
function isDriveShareUrl(value: string): boolean {
    return isDriveUrl(value);
}

export interface DriveMediaState {
    blobUrl: string | null;
    mimeType: string | null;
    loading: boolean;
    error: string | null;
}

/**
 * Resolves a media URL to a usable src string.
 *
 * Supported `mediaUrl` formats:
 *  - **S3 key** (e.g. `OC3_M01T/clip.mp4`) — fetches a presigned URL from
 *    `GET /media/presign/` and returns it directly as src for native streaming.
 *  - **Drive share URL** (e.g. `https://drive.google.com/file/d/...`) — proxied
 *    through the backend and returned as a blob URL.
 *  - **Plain HTTP(S) URL** — returned as-is without any fetching.
 */
export function useDriveMedia(
    mediaUrl: string | undefined,
    token: string,
): DriveMediaState {
    const [state, setState] = useState<DriveMediaState>({
        blobUrl: null,
        mimeType: null,
        loading: false,
        error: null,
    });

    // Track the current blob URL so we can revoke it before allocating a new one.
    const blobRef = useRef<string | null>(null);

    useEffect(() => {
        if (!mediaUrl) {
            setState({ blobUrl: null, mimeType: null, loading: false, error: null });
            return;
        }

        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const run = async () => {
            try {
                // ── S3 key: fetch presigned URL, use directly as src ──────────
                if (isS3Key(mediaUrl)) {
                    const res = await fetch(
                        `${API_BASE_URL}/media/presign/?key=${encodeURIComponent(mediaUrl)}`,
                        token ? { headers: { Authorization: `Bearer ${token}` } } : {},
                    );
                    if (!res.ok) throw new Error(`Presign failed: HTTP ${res.status}`);
                    const { url } = await res.json() as { url: string };
                    if (cancelled) return;
                    // Presigned URL is not a blob — do not store in blobRef for revocation.
                    setState({ blobUrl: url, mimeType: mimeFromPath(mediaUrl), loading: false, error: null });
                    return;
                }

                // ── Direct HTTP(S) URL: use as-is ────────────────────────────
                if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) {
                    if (!isDriveShareUrl(mediaUrl)) {
                        if (!cancelled) {
                            setState({ blobUrl: mediaUrl, mimeType: null, loading: false, error: null });
                        }
                        return;
                    }
                }

                // ── Drive share URL: proxy through backend ────────────────────
                const params = new URLSearchParams();
                if (isDriveShareUrl(mediaUrl)) {
                    const fileId = extractDriveFileId(mediaUrl);
                    if (!fileId) {
                        setState({
                            blobUrl: null,
                            mimeType: null,
                            loading: false,
                            error: "Cannot extract Drive file ID from URL.",
                        });
                        return;
                    }
                    params.set("file_id", fileId);
                } else {
                    params.set("file_name", mediaUrl);
                }

                const res = await fetch(
                    `${API_BASE_URL}/media/drive/?${params.toString()}`,
                    token ? { headers: { Authorization: `Bearer ${token}` } } : {},
                );

                if (!res.ok) {
                    throw new Error(`Drive media fetch failed: HTTP ${res.status}`);
                }

                const mimeType = (res.headers.get("Content-Type") ?? "").split(";")[0].trim();
                const blob = await res.blob();

                if (cancelled) return;

                // Revoke previous blob URL to prevent memory leaks.
                if (blobRef.current?.startsWith("blob:")) URL.revokeObjectURL(blobRef.current);

                const url = URL.createObjectURL(blob);
                blobRef.current = url;
                setState({ blobUrl: url, mimeType, loading: false, error: null });
            } catch (err) {
                console.error("[useDriveMedia] Failed to load media:", mediaUrl, err);
                if (!cancelled) {
                    setState({
                        blobUrl: null,
                        mimeType: null,
                        loading: false,
                        error: String(err),
                    });
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [mediaUrl, token]);

    // Revoke blob URLs on unmount (skip presigned/direct URLs).
    useEffect(() => {
        return () => {
            if (blobRef.current?.startsWith("blob:")) URL.revokeObjectURL(blobRef.current);
        };
    }, []);

    return state;
}
