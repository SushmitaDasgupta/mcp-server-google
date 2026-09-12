import { describe, expect, it } from "vitest";
import {
  buildAppendRequest,
  resolveDocumentEndIndex,
} from "../../src/services/googleDocsService.js";

describe("google docs append helpers", () => {
  it("resolves end index from document body", () => {
    expect(
      resolveDocumentEndIndex({
        body: { content: [{ endIndex: 42 }] },
      }),
    ).toBe(42);
  });

  it("defaults end index when body is empty", () => {
    expect(resolveDocumentEndIndex({})).toBe(1);
  });

  it("builds insertText request just before the trailing newline", () => {
    const request = buildAppendRequest(10, "notes");
    expect(request.requests?.[0]?.insertText).toEqual({
      location: { index: 9 },
      text: "notes",
    });
  });
});
