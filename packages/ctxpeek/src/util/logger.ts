// Tiny logger. Stdout is reserved for the MCP transport when running as a.
export type Level = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
};

const LEVELS: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LoggerOptions = {
  readonly level?: Level;
  readonly stream?: NodeJS.WritableStream;
  readonly json?: boolean;
};

export function createLogger(level: Level = "info", opts: LoggerOptions = {}): Logger {
  const min = LEVELS[opts.level ?? level];
  const stream = opts.stream ?? process.stderr;
  const json = opts.json ?? false;

  function emit(lvl: Level, msg: string, fields?: Record<string, unknown>): void {
    if (LEVELS[lvl] < min) return;
    if (json) {
      const payload = {
        ts: new Date().toISOString(),
        level: lvl,
        msg,
        ...fields,
      };
      stream.write(`${JSON.stringify(payload)}\n`);
    } else {
      const extra = fields && Object.keys(fields).length > 0 ? ` ${formatFields(fields)}` : "";
      stream.write(`[ctxpeek ${lvl}] ${msg}${extra}\n`);
    }
  }

  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
  };
}

function formatFields(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}=${formatValue(v)}`)
    .join(" ");
}

function formatValue(v: unknown): string {
  if (typeof v === "string") return /\s/.test(v) ? JSON.stringify(v) : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  try {
    return JSON.stringify(v);
  } catch {
    return "<unserializable>";
  }
}

export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
