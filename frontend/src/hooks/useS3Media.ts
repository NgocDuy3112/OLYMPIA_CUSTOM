import { useEffect, useState } from "react";
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

/**
 * Returns true when the value looks like an S3 object key stored in the DB,
 * e.g. "OC3_M01T/clip.mp4" or "OC3_M_BP/image.jpg".
 */
export function isS3Key(url: string): boolean {
    return url.startsWith("OC3_M") && url.includes("/");
}

export interface S3MediaState {
    /**
     * A usable src string for `<img>` / `<audio>` / `<video>`.
     *
     *  - For S3 keys: the presigned S3 URL.
     *  - For plain http(s) URLs: the URL unchanged.
     *  - `null` while we are waiting for the first presign round-trip or when
     *    `mediaUrl` is undefined.
     */
    src: string | null;
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
 *  - **Plain HTTP(S) URL** — returned as-is without any fetching.
 */
export function useS3Media(
    mediaUrl: string | undefined,
    token: string,
): S3MediaState {
    const [state, setState] = useState<S3MediaState>({
        src: null,
        mimeType: null,
        loading: false,
        error: null,
    });

    useEffect(() => {
        if (!mediaUrl) {
            setState({ src: null, mimeType: null, loading: false, error: null });
            return;
        }

        // Plain HTTP(S) URL: nothing to fetch, return synchronously.
        if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) {
            setState({ src: mediaUrl, mimeType: null, loading: false, error: null });
            return;
        }

        // S3 key path (anything else is treated as an S3 key, matching the
        // previous behaviour of the hook for non-URL inputs).
        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const run = async () => {
            try {
                const res = await fetch(
                    `${API_BASE_URL}/media/presign/?key=${encodeURIComponent(mediaUrl)}`,
                    token ? { headers: { Authorization: `Bearer ${token}` } } : {},
                );
                if (!res.ok) throw new Error(`Presign failed: HTTP ${res.status}`);
                const { url } = await res.json() as { url: string };
                if (cancelled) return;
                setState({ src: url, mimeType: mimeFromPath(mediaUrl), loading: false, error: null });
            } catch (err) {
                if (cancelled) return;
                console.error("[useS3Media] Failed to load media:", mediaUrl, err);
                setState({
                    src: null,
                    mimeType: null,
                    loading: false,
                    error: err instanceof Error ? err.message : "Unknown error",
                });
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [mediaUrl, token]);

    return state;
}
