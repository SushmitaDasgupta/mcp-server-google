export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[resolveLevel()];
}

/** Redact common secret-like keys from structured fields. */
function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set([
    "access_token",
    "refresh_token",
    "client_secret",
    "authorization",
    "token",
    "body",
    "api_key",
    "mcp_api_key",
  ]);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (blocked.has(key.toLowerCase())) {
      out[key] = "[redacted]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

function write(
  level: LogLevel,
  message: string,
  fields?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...(fields ? sanitize(fields) : {}),
  };

  // stdout is reserved for MCP JSON-RPC; always log to stderr
  console.error(JSON.stringify(entry));
}

export const logger = {
  debug(message: string, fields?: Record<string, unknown>): void {
    write("debug", message, fields);
  },
  info(message: string, fields?: Record<string, unknown>): void {
    write("info", message, fields);
  },
  warn(message: string, fields?: Record<string, unknown>): void {
    write("warn", message, fields);
  },
  error(message: string, fields?: Record<string, unknown>): void {
    write("error", message, fields);
  },
};

export function createRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
