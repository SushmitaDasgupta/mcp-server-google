import { describe, expect, it } from "vitest";
import {
  buildMimeMessage,
  encodeMessage,
  MemoryIdempotencyStore,
  normalizeEmailInput,
} from "../../src/services/gmailService.js";
import type { EmailSendResult } from "../../src/types/index.js";

describe("gmail MIME helpers", () => {
  it("builds a plain-text MIME message with headers", () => {
    const mime = buildMimeMessage({
      to: ["a@example.com"],
      cc: ["c@example.com"],
      bcc: ["b@example.com"],
      subject: "Hello",
      body: "World",
    });

    expect(mime).toContain("To: a@example.com");
    expect(mime).toContain("Cc: c@example.com");
    expect(mime).toContain("Bcc: b@example.com");
    expect(mime).toContain("Subject: Hello");
    expect(mime).toContain("Content-Type: text/plain; charset=utf-8");
    expect(mime.endsWith("World")).toBe(true);
  });

  it("base64url-encodes messages without padding", () => {
    const encoded = encodeMessage("hello");
    expect(encoded).not.toMatch(/[+/=]/);
    expect(Buffer.from(encoded, "base64url").toString("utf8")).toBe("hello");
  });

  it("normalizes email input", () => {
    const normalized = normalizeEmailInput({
      to: ["  user@example.com "],
      subject: "Hi",
      body: "Body",
    });
    expect(normalized.to).toEqual(["user@example.com"]);
  });
});

describe("idempotency store", () => {
  it("returns cached send results for the same key", () => {
    const store = new MemoryIdempotencyStore(60_000);
    const result: EmailSendResult = {
      success: true,
      messageId: "msg-1",
      threadId: "thr-1",
      message: "Email sent successfully.",
    };

    store.set("key-1", result);
    expect(store.get("key-1")).toEqual(result);
    expect(store.get("missing")).toBeUndefined();
  });
});
