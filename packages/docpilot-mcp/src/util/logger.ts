/**
 * Tiny logger. Stdio is reserved for the MCP transport; everything goes
 * to stderr (visible in client logs) and to the rotating network log
 * under env-paths/logs/network.log (1 MB cap).
 */
export type Level = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(_level: Level): Logger {
  // TODO(v0.1): structured JSON to stderr; network log to disk
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}
