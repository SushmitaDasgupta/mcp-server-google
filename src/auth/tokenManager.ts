import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "../utils/logger.js";

export interface StoredTokens {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number | null;
}

export interface TokenManagerOptions {
  tokenPath: string;
  /**
   * Full token.json contents as a JSON string (Railway / production).
   * Used when no token file exists (or file has no usable tokens).
   */
  envTokensJson?: string;
  /** Used when no token file / GOOGLE_TOKENS_JSON exists. */
  envRefreshToken?: string;
  /** When false, load still works but save() is a no-op. */
  persistToDisk?: boolean;
}

export class TokenManager {
  private readonly tokenPath: string;
  private readonly envTokensJson?: string;
  private readonly envRefreshToken?: string;
  private readonly persistToDisk: boolean;
  /** In-memory copy so refresh updates work without disk in production. */
  private memoryTokens: StoredTokens | null = null;

  constructor(tokenPathOrOptions: string | TokenManagerOptions) {
    if (typeof tokenPathOrOptions === "string") {
      this.tokenPath = tokenPathOrOptions;
      this.persistToDisk = true;
    } else {
      this.tokenPath = tokenPathOrOptions.tokenPath;
      this.envTokensJson = tokenPathOrOptions.envTokensJson?.trim() || undefined;
      this.envRefreshToken = tokenPathOrOptions.envRefreshToken?.trim() || undefined;
      this.persistToDisk = tokenPathOrOptions.persistToDisk ?? true;
    }
  }

  async load(): Promise<StoredTokens | null> {
    if (this.memoryTokens) {
      return this.memoryTokens;
    }

    const fromFile = await this.loadFromFile();
    if (fromFile?.refresh_token || fromFile?.access_token) {
      this.memoryTokens = fromFile;
      return fromFile;
    }

    const fromTokensJson = this.loadFromEnvTokensJson();
    if (fromTokensJson?.refresh_token || fromTokensJson?.access_token) {
      this.memoryTokens = fromTokensJson;
      logger.info("Loaded Google tokens from GOOGLE_TOKENS_JSON env");
      return fromTokensJson;
    }

    if (this.envRefreshToken) {
      const fromEnv: StoredTokens = { refresh_token: this.envRefreshToken };
      this.memoryTokens = fromEnv;
      logger.info("Loaded Google refresh token from GOOGLE_REFRESH_TOKEN env");
      return fromEnv;
    }

    return fromFile;
  }

  private loadFromEnvTokensJson(): StoredTokens | null {
    if (!this.envTokensJson) {
      return null;
    }
    try {
      return JSON.parse(this.envTokensJson) as StoredTokens;
    } catch (error) {
      logger.warn("Failed to parse GOOGLE_TOKENS_JSON", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      return null;
    }
  }

  async save(tokens: StoredTokens): Promise<void> {
    this.memoryTokens = tokens;

    if (!this.persistToDisk) {
      logger.debug("Skipping token disk write (persist disabled)", {
        path: this.tokenPath,
      });
      return;
    }

    const dir = path.dirname(this.tokenPath);
    await mkdir(dir, { recursive: true });
    await writeFile(this.tokenPath, JSON.stringify(tokens, null, 2), {
      mode: 0o600,
      encoding: "utf8",
    });
    logger.info("OAuth tokens saved", { path: this.tokenPath });
  }

  async clear(): Promise<void> {
    this.memoryTokens = null;
    if (!this.persistToDisk) {
      return;
    }
    await writeFile(this.tokenPath, "{}", { mode: 0o600, encoding: "utf8" });
  }

  private async loadFromFile(): Promise<StoredTokens | null> {
    try {
      const raw = await readFile(this.tokenPath, "utf8");
      return JSON.parse(raw) as StoredTokens;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "ENOENT"
      ) {
        return null;
      }
      logger.warn("Failed to load token file", {
        path: this.tokenPath,
        reason: error instanceof Error ? error.message : "unknown",
      });
      return null;
    }
  }
}
