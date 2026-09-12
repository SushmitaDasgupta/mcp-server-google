import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { AppConfig } from "../utils/config.js";
import { assertGoogleCredentials } from "../utils/config.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { TokenManager, type StoredTokens } from "./tokenManager.js";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/documents",
] as const;

export class GoogleAuth {
  private readonly tokenManager: TokenManager;
  private client: OAuth2Client | null = null;

  constructor(private readonly config: AppConfig) {
    this.tokenManager = new TokenManager({
      tokenPath: config.googleTokenPath,
      envTokensJson: config.googleTokensJson || undefined,
      envRefreshToken: config.googleRefreshToken || undefined,
      persistToDisk: config.googleTokenPersist,
    });
  }

  createOAuth2Client(): OAuth2Client {
    assertGoogleCredentials(this.config);
    return new google.auth.OAuth2(
      this.config.googleClientId,
      this.config.googleClientSecret,
      this.config.googleRedirectUri,
    );
  }

  getAuthUrl(client: OAuth2Client): string {
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [...GOOGLE_SCOPES],
    });
  }

  async exchangeCode(client: OAuth2Client, code: string): Promise<StoredTokens> {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const stored: StoredTokens = {
      access_token: tokens.access_token ?? undefined,
      refresh_token: tokens.refresh_token ?? undefined,
      scope: tokens.scope ?? undefined,
      token_type: tokens.token_type ?? undefined,
      expiry_date: tokens.expiry_date ?? null,
    };
    await this.tokenManager.save(stored);
    return stored;
  }

  async getAuthenticatedClient(): Promise<OAuth2Client> {
    if (this.client) {
      return this.client;
    }

    assertGoogleCredentials(this.config);
    const client = this.createOAuth2Client();
    const tokens = await this.tokenManager.load();

    if (!tokens?.refresh_token && !tokens?.access_token) {
      throw new AppError(
        "AUTHENTICATION_REQUIRED",
        "Google authentication is required. Run `npm run auth` locally, or set GOOGLE_TOKENS_JSON.",
      );
    }

    client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date ?? undefined,
    });

    client.on("tokens", (fresh) => {
      void (async () => {
        try {
          const existing = (await this.tokenManager.load()) ?? {};
          await this.tokenManager.save({
            ...existing,
            access_token: fresh.access_token ?? existing.access_token,
            refresh_token: fresh.refresh_token ?? existing.refresh_token,
            scope: fresh.scope ?? existing.scope,
            token_type: fresh.token_type ?? existing.token_type,
            expiry_date: fresh.expiry_date ?? existing.expiry_date ?? null,
          });
        } catch (error) {
          logger.warn("Failed to persist refreshed tokens", {
            reason: error instanceof Error ? error.message : "unknown",
          });
        }
      })();
    });

    this.client = client;
    return client;
  }
}
