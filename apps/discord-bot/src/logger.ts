type Level = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// Every level writes to stderr, which is where all the console.error calls this
// replaced were going; the level is carried in the prefix instead of the stream.
export function createLogger(scope: string): Logger {
  const write =
    (level: Level) =>
    (...args: unknown[]): void => {
      console.error(`[${scope}] ${level}:`, ...args);
    };

  return {
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
  };
}
