/**
 * API and WebSocket base URLs.
 *
 * In development these default to localhost.
 * In production, set VITE_API_BASE_URL and VITE_WS_BASE_URL at build time:
 *
 *   VITE_API_BASE_URL=https://olympia.yourdomain.com \
 *   VITE_WS_BASE_URL=wss://olympia.yourdomain.com \
 *   npm run build
 *
 * Vite replaces `import.meta.env.VITE_*` at build time.
 * When the env var is unset (development), the fallback localhost values are used.
 */
export const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
export const WS_BASE_URL =
    import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000";