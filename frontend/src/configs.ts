/**
 * API and WebSocket base URLs.
 *
 * Defaults are relative to the current origin so the app can work behind a
 * reverse proxy (nginx/ngrok) in dev and production.
 *
 * You can still override them at build time if you want to force a specific host:
 *
 *   VITE_API_BASE_URL=https://olympia.yourdomain.com \
 *   VITE_WS_BASE_URL=wss://olympia.yourdomain.com \
 *   npm run build
 *
 * Vite replaces `import.meta.env.VITE_*` at build time.
 */
export const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ?? "/api";
export const WS_BASE_URL =
    import.meta.env.VITE_WS_BASE_URL ?? (() => {
        if (typeof window === "undefined") return "ws://localhost:8000";
        return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
    })();