import { describe, expect, it, vi } from "vitest";
import { createDraftEmailHandler } from "../../src/tools/gmail/draftEmail.js";
import { createSendEmailHandler } from "../../src/tools/gmail/sendEmail.js";
import { createAppendContentHandler } from "../../src/tools/googleDocs/appendContent.js";
import type { GmailService, GoogleDocsService } from "../../src/types/index.js";

describe("tool handlers with mocked services", () => {
  it("gmail_draft_email calls GmailService.draftEmail once", async () => {
    const gmail: GmailService = {
      draftEmail: vi.fn(async () => ({
        success: true as const,
        draftId: "d1",
        message: "Email draft created successfully.",
      })),
      sendEmail: vi.fn(),
    };

    const handler = createDraftEmailHandler(gmail);
    const result = await handler({
      to: ["a@example.com"],
      subject: "Hi",
      body: "Hello",
    });

    expect(gmail.draftEmail).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('"draftId": "d1"');
  });

  it("gmail_send_email calls GmailService.sendEmail once", async () => {
    const gmail: GmailService = {
      draftEmail: vi.fn(),
      sendEmail: vi.fn(async () => ({
        success: true as const,
        messageId: "m1",
        threadId: "t1",
        message: "Email sent successfully.",
      })),
    };

    const handler = createSendEmailHandler(gmail);
    const result = await handler({
      to: ["a@example.com"],
      subject: "Hi",
      body: "Hello",
      idempotencyKey: "k1",
    });

    expect(gmail.sendEmail).toHaveBeenCalledTimes(1);
    expect(result.content[0]?.text).toContain('"messageId": "m1"');
  });

  it("google_docs_append_content calls GoogleDocsService.appendContent", async () => {
    const docs: GoogleDocsService = {
      appendContent: vi.fn(async () => ({
        success: true as const,
        documentId: "doc1",
        message: "Content appended successfully.",
      })),
    };

    const handler = createAppendContentHandler(docs);
    const result = await handler({
      documentId: "doc1",
      content: "notes",
    });

    expect(docs.appendContent).toHaveBeenCalledWith("doc1", "notes");
    expect(result.content[0]?.text).toContain("Content appended successfully");
  });
});
