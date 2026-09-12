import type { McpServer } from "@modelcontextprotocol/server";
import {
  emailInputSchema,
  sendEmailInputSchema,
} from "../schemas/emailSchema.js";
import { appendContentInputSchema } from "../schemas/googleDocsSchema.js";
import type { GmailService, GoogleDocsService } from "../types/index.js";
import { createDraftEmailHandler } from "../tools/gmail/draftEmail.js";
import { createSendEmailHandler } from "../tools/gmail/sendEmail.js";
import { createAppendContentHandler } from "../tools/googleDocs/appendContent.js";

export interface ToolDependencies {
  gmail: GmailService;
  docs: GoogleDocsService;
}

export function registerTools(
  server: McpServer,
  deps: ToolDependencies,
): void {
  server.registerTool(
    "gmail_draft_email",
    {
      description:
        "Create a draft email in the authenticated user's Gmail account. " +
        "The email is NOT sent. Use gmail_send_email when the message should actually be delivered. " +
        "Supports to, optional cc/bcc, subject, and plain-text body.",
      inputSchema: emailInputSchema,
    },
    createDraftEmailHandler(deps.gmail),
  );

  server.registerTool(
    "gmail_send_email",
    {
      description:
        "Send an email from the authenticated Gmail account to external recipients. " +
        "This action delivers the message immediately and cannot be automatically undone. " +
        "Prefer gmail_draft_email when the user only wants a draft. " +
        "Supports optional idempotencyKey to avoid duplicate sends on retries.",
      inputSchema: sendEmailInputSchema,
    },
    createSendEmailHandler(deps.gmail),
  );

  server.registerTool(
    "google_docs_append_content",
    {
      description:
        "Append plain text to the end of an existing Google Doc. " +
        "Existing document content is preserved. " +
        "Requires the document ID from the Google Docs URL. " +
        "Does not create documents or edit arbitrary sections.",
      inputSchema: appendContentInputSchema,
    },
    createAppendContentHandler(deps.docs),
  );
}
