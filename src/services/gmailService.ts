import { google, type gmail_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type {
  EmailDraftResult,
  EmailInput,
  EmailSendResult,
  GmailService,
} from "../types/index.js";
import { AppError, mapGoogleApiError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import {
  assertNonEmptyString,
  assertValidEmails,
  LIMITS,
} from "../utils/validation.js";

export type AuthClientProvider = () => Promise<OAuth2Client>;

export interface IdempotencyStore {
  get(key: string): EmailSendResult | undefined;
  set(key: string, result: EmailSendResult): void;
}

/** Simple in-memory idempotency cache with TTL. */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<
    string,
    { result: EmailSendResult; expiresAt: number }
  >();

  constructor(private readonly ttlMs = 24 * 60 * 60 * 1000) {}

  get(key: string): EmailSendResult | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.result;
  }

  set(key: string, result: EmailSendResult): void {
    this.entries.set(key, {
      result,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}

export function buildMimeMessage(input: EmailInput): string {
  const headers: string[] = [
    `To: ${input.to.join(", ")}`,
    `Subject: ${input.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
  ];

  if (input.cc && input.cc.length > 0) {
    headers.push(`Cc: ${input.cc.join(", ")}`);
  }
  if (input.bcc && input.bcc.length > 0) {
    headers.push(`Bcc: ${input.bcc.join(", ")}`);
  }

  return `${headers.join("\r\n")}\r\n\r\n${input.body}`;
}

export function encodeMessage(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function normalizeEmailInput(input: EmailInput): EmailInput {
  const to = assertValidEmails("to", input.to, { required: true });
  const cc = assertValidEmails("cc", input.cc);
  const bcc = assertValidEmails("bcc", input.bcc);
  const subject = assertNonEmptyString(
    "subject",
    input.subject,
    LIMITS.maxSubjectLength,
  );
  const body = assertNonEmptyString("body", input.body, LIMITS.maxBodyLength);

  return {
    to,
    cc: cc.length ? cc : undefined,
    bcc: bcc.length ? bcc : undefined,
    subject,
    body,
    idempotencyKey: input.idempotencyKey,
  };
}

export class GoogleGmailService implements GmailService {
  constructor(
    private readonly getAuthClient: AuthClientProvider,
    private readonly idempotencyStore: IdempotencyStore = new MemoryIdempotencyStore(),
  ) {}

  private async gmail(): Promise<gmail_v1.Gmail> {
    const auth = await this.getAuthClient();
    return google.gmail({ version: "v1", auth });
  }

  async draftEmail(input: EmailInput): Promise<EmailDraftResult> {
    const normalized = normalizeEmailInput(input);
    const raw = encodeMessage(buildMimeMessage(normalized));

    try {
      const gmail = await this.gmail();
      const response = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: { raw },
        },
      });

      const draftId = response.data.id;
      if (!draftId) {
        throw new AppError(
          "GOOGLE_API_ERROR",
          "Gmail API did not return a draft ID.",
        );
      }

      return {
        success: true,
        draftId,
        message: "Email draft created successfully.",
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw mapGoogleApiError(error);
    }
  }

  async sendEmail(input: EmailInput): Promise<EmailSendResult> {
    const normalized = normalizeEmailInput(input);

    if (normalized.idempotencyKey) {
      const cached = this.idempotencyStore.get(normalized.idempotencyKey);
      if (cached) {
        logger.info("Returning cached send result for idempotency key", {
          tool: "gmail_send_email",
        });
        return cached;
      }
    }

    const raw = encodeMessage(buildMimeMessage(normalized));

    try {
      const gmail = await this.gmail();
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });

      const messageId = response.data.id;
      if (!messageId) {
        throw new AppError(
          "GOOGLE_API_ERROR",
          "Gmail API did not return a message ID.",
        );
      }

      const result: EmailSendResult = {
        success: true,
        messageId,
        threadId: response.data.threadId ?? undefined,
        message: "Email sent successfully.",
      };

      if (normalized.idempotencyKey) {
        this.idempotencyStore.set(normalized.idempotencyKey, result);
      }

      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw mapGoogleApiError(error);
    }
  }
}
