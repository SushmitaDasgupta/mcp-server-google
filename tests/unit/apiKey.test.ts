import { describe, expect, it } from "vitest";
import {
  extractApiKeyFromHeaders,
  isValidApiKey,
  requireApiKey,
  unauthorizedApiKeyResponse,
} from "../../src/middleware/apiKey.js";

describe("apiKey middleware", () => {
  it("extracts Bearer token", () => {
    expect(
      extractApiKeyFromHeaders("Bearer secret-key", undefined),
    ).toBe("secret-key");
  });

  it("extracts X-API-Key", () => {
    expect(extractApiKeyFromHeaders(undefined, "from-header")).toBe(
      "from-header",
    );
  });

  it("prefers Bearer over X-API-Key", () => {
    expect(
      extractApiKeyFromHeaders("Bearer from-bearer", "from-header"),
    ).toBe("from-bearer");
  });

  it("validates matching keys", () => {
    expect(isValidApiKey("abc", "abc")).toBe(true);
    expect(isValidApiKey("abc", "xyz")).toBe(false);
    expect(isValidApiKey(null, "abc")).toBe(false);
  });

  it("requireApiKey returns 401 when missing", async () => {
    const rejected = requireApiKey(new Request("http://localhost/mcp"), "secret");
    expect(rejected).not.toBeNull();
    expect(rejected?.status).toBe(401);
  });

  it("requireApiKey allows valid Bearer", () => {
    const req = new Request("http://localhost/mcp", {
      headers: { Authorization: "Bearer secret" },
    });
    expect(requireApiKey(req, "secret")).toBeNull();
  });

  it("unauthorized response is JSON 401", async () => {
    const res = unauthorizedApiKeyResponse();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});
