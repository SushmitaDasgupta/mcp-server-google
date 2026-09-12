import { AppError } from "./errors.js";

export interface AppConfig {
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  googleTokenPath: string;
  /** Full token.json JSON string (Railway / production bootstrap). */
  googleTokensJson: string;
  /** Refresh token from env (fallback if GOOGLE_TOKENS_JSON unset). */
  googleRefreshToken: string;
  /**
   * When false, skip writing refreshed tokens to disk (ephemeral FS).
   * Set GOOGLE_TOKEN_PERSIST=true when using a Railway Volume.
   */
  googleTokenPersist: boolean;
  /** Optional shared secret for HTTP /mcp. When empty, /mcp is open. */
  mcpApiKey: string;
  port: number;
  logLevel: string;
  nodeEnv: string;
}

function resolveTokenPersist(hasEnvTokens: boolean, nodeEnv: string): boolean {
  const raw = process.env.GOOGLE_TOKEN_PERSIST?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  // Production + env tokens → skip disk by default (ephemeral container FS).
  if (nodeEnv === "production" && hasEnvTokens) return false;
  return true;
}

export function loadConfig(): AppConfig {
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const googleRedirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ??
    "http://localhost:3000/oauth2callback";
  const googleTokenPath =
    process.env.GOOGLE_TOKEN_PATH?.trim() ?? ".tokens/google-tokens.json";
  const googleTokensJson = process.env.GOOGLE_TOKENS_JSON?.trim() ?? "";
  const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim() ?? "";
  const mcpApiKey = process.env.MCP_API_KEY?.trim() ?? "";
  const logLevel = process.env.LOG_LEVEL?.trim() ?? "info";
  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  const portRaw = process.env.PORT?.trim();
  const port = portRaw ? Number(portRaw) : 3000;
  const hasEnvTokens =
    googleTokensJson.length > 0 || googleRefreshToken.length > 0;

  return {
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
    googleTokenPath,
    googleTokensJson,
    googleRefreshToken,
    googleTokenPersist: resolveTokenPersist(hasEnvTokens, nodeEnv),
    mcpApiKey,
    port: Number.isFinite(port) && port > 0 ? port : 3000,
    logLevel,
    nodeEnv,
  };
}

export function assertGoogleCredentials(config: AppConfig): void {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new AppError(
      "AUTHENTICATION_REQUIRED",
      "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. Copy .env.example to .env and fill in OAuth credentials.",
    );
  }
}

