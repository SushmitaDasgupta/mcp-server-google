import { google, type docs_v1 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type {
  AppendContentResult,
  GoogleDocsService,
} from "../types/index.js";
import { AppError, mapGoogleApiError } from "../utils/errors.js";
import {
  assertNonEmptyString,
  LIMITS,
} from "../utils/validation.js";

export type AuthClientProvider = () => Promise<OAuth2Client>;

/**
 * Build the Docs API batchUpdate body that inserts text at the end of the body.
 * Exported for unit tests.
 */
export function buildAppendRequest(
  endIndex: number,
  content: string,
): docs_v1.Schema$BatchUpdateDocumentRequest {
  // endIndex points past the final newline; insert just before it.
  const insertIndex = Math.max(1, endIndex - 1);
  return {
    requests: [
      {
        insertText: {
          location: { index: insertIndex },
          text: content,
        },
      },
    ],
  };
}

export function resolveDocumentEndIndex(
  document: docs_v1.Schema$Document,
): number {
  const bodyContent = document.body?.content;
  if (!bodyContent || bodyContent.length === 0) {
    return 1;
  }

  const last = bodyContent[bodyContent.length - 1];
  const endIndex = last.endIndex;
  if (typeof endIndex !== "number" || endIndex < 1) {
    return 1;
  }
  return endIndex;
}

export class GoogleDocsApiService implements GoogleDocsService {
  constructor(private readonly getAuthClient: AuthClientProvider) {}

  private async docs(): Promise<docs_v1.Docs> {
    const auth = await this.getAuthClient();
    return google.docs({ version: "v1", auth });
  }

  async appendContent(
    documentId: string,
    content: string,
  ): Promise<AppendContentResult> {
    const id = assertNonEmptyString(
      "documentId",
      documentId,
      LIMITS.maxDocumentIdLength,
    );
    const text = assertNonEmptyString(
      "content",
      content,
      LIMITS.maxDocContentLength,
    );

    try {
      const docs = await this.docs();
      const document = await docs.documents.get({ documentId: id });
      const endIndex = resolveDocumentEndIndex(document.data);
      const requestBody = buildAppendRequest(endIndex, text);

      await docs.documents.batchUpdate({
        documentId: id,
        requestBody,
      });

      return {
        success: true,
        documentId: id,
        message: "Content appended successfully.",
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw mapGoogleApiError(error);
    }
  }
}
