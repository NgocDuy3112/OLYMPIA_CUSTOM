import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/configs";

/** Returns true when the URL points to Google Drive or Google Docs. */
export function isDriveUrl(url: string): boolean {
    return url.includes("drive.google.com") || url.includes("docs.google.com");
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
 * Fetches media through the backend `/media/drive/` proxy and returns a safe
 * blob URL along with the resolved MIME type.
 *
 * The `mediaUrl` value can be either:
 *  - A **Drive share URL** (e.g. `https://drive.google.com/file/d/...`) — the
 *    hook extracts the file ID and calls `?file_id=...`.
 *  - A **plain filename** (e.g. `cau1_anh.jpg`) — the hook calls
 *    `?file_name=...` and the backend resolves the ID server-side.
 *
 * For values that are neither a Drive URL nor a non-empty string, all fields
 * are null so callers can skip rendering.
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

        // Build query params: file_id for Drive URLs, file_name for plain filenames
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

        const run = async () => {
            try {
                const res = await fetch(
                    `${API_BASE_URL}/media/drive/?${params.toString()}`,
                    token ? { headers: { Authorization: `Bearer ${token}` } } : {},
                );

                if (!res.ok) {
                    throw new Error(`Drive media fetch failed: HTTP ${res.status}`);
                }

                // Strip charset and boundary suffixes from Content-Type
                const mimeType = (res.headers.get("Content-Type") ?? "").split(";")[0].trim();
                const blob = await res.blob();

                if (cancelled) return;

                // Revoke previous blob URL to prevent memory leaks
                if (blobRef.current) URL.revokeObjectURL(blobRef.current);

                const url = URL.createObjectURL(blob);
                blobRef.current = url;
                setState({ blobUrl: url, mimeType, loading: false, error: null });
            } catch (err) {
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

    // Revoke the blob URL when the component using this hook unmounts.
    useEffect(() => {
        return () => {
            if (blobRef.current) URL.revokeObjectURL(blobRef.current);
        };
    }, []);

    return state;
}
