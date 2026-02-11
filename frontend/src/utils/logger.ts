type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "NONE";

const LEVELS: Record<LogLevel, number> = {
    DEBUG: 10,
    INFO: 20,
    WARN: 30,
    ERROR: 40,
    NONE: 50,
};

const isDev = Boolean(import.meta.env.DEV);
let currentLevel: LogLevel = isDev ? "DEBUG" : "WARN";

// Allow overriding with VITE_LOG_LEVEL (DEBUG|INFO|WARN|ERROR|NONE)
const envLevel = import.meta.env.VITE_LOG_LEVEL as string | undefined;
if (envLevel) {
    const up = envLevel.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(LEVELS, up)) {
        currentLevel = up as LogLevel;
    }
}

const LOG_ENDPOINT = import.meta.env.VITE_LOG_ENDPOINT as string | undefined;

const shouldLog = (level: LogLevel) => LEVELS[level] >= LEVELS[currentLevel];

const sendToRemote = async (payload: Record<string, unknown>) => {
    if (!LOG_ENDPOINT) return;
    try {
        // Fire-and-forget; don't block the UI
        await fetch(LOG_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
        });
    } catch {
        // Ignore remote logging errors
    }
};

const createPrefix = (level: LogLevel, ctx?: string) => {
    const ts = new Date().toISOString();
    return `[${ts}][${level}]${ctx ? `[${ctx}]` : ""}`;
};

export type Logger = {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    setLevel: (level: LogLevel) => void;
};

const makeLogMethod = (level: LogLevel, ctx?: string) => {
    return (...args: unknown[]) => {
        if (!shouldLog(level)) return;

        const prefix = createPrefix(level, ctx);

        // Pick console method
        const method: ((...m: unknown[]) => void) = (() => {
            switch (level) {
                case "DEBUG":
                    return console.debug ?? console.log;
                case "INFO":
                    return console.info ?? console.log;
                case "WARN":
                    return console.warn ?? console.log;
                case "ERROR":
                    return console.error ?? console.log;
                default:
                    return console.log;
            }
        })();

        try {
            method(prefix, ...args);
        } catch {
            // If console.* throws for some reason, fallback
            console.log(prefix, ...args);
        }

        // Remote logging (non-blocking)
        if (LOG_ENDPOINT) {
            const [first, ...rest] = args;
            const payload: Record<string, unknown> = {
                ts: new Date().toISOString(),
                level,
                context: ctx,
                message: typeof first === "string" ? first : undefined,
                args: rest,
            };
            void sendToRemote(payload);
        }
    };
};

export const createLogger = (context?: string): Logger => {
    return {
        debug: makeLogMethod("DEBUG", context),
        info: makeLogMethod("INFO", context),
        warn: makeLogMethod("WARN", context),
        error: makeLogMethod("ERROR", context),
        setLevel: (l: LogLevel) => {
            if (Object.prototype.hasOwnProperty.call(LEVELS, l)) {
                currentLevel = l;
            }
        },
    };
};

// Default, app-wide logger
const defaultLogger = createLogger();


export default defaultLogger;
