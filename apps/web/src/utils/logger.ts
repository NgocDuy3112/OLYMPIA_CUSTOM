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

        await fetch(LOG_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
        });
    } catch {

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

        const method: ((...m: unknown[]) => void) = (() => {
            switch (level) {
                case "DEBUG":
                    return console.debug ?? (() => {});
                case "INFO":
                    return console.info ?? (() => {});
                case "WARN":
                    return console.warn ?? (() => {});
                case "ERROR":
                    return console.error ?? (() => {});
                default:
                    return console.info ?? (() => {});
            }
        })();

        try {
            method(prefix, ...args);
        } catch {

            try { console.error(prefix, ...args); } catch {}
        }

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

const defaultLogger = createLogger();

export default defaultLogger;
