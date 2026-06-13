export const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ?? "/api";
export const WS_BASE_URL =
    import.meta.env.VITE_WS_BASE_URL ?? (() => {
        if (typeof window === "undefined") return "ws://localhost:8000";
        return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
    })();

 type AppEnv = "stage" | "prod";

export const APP_ENV: AppEnv =
    (import.meta.env.VITE_APP_ENV as AppEnv | undefined) ?? "stage";

/** True when running on stage/local — beta banners should be shown. */
export const IS_BETA: boolean = APP_ENV !== "prod";