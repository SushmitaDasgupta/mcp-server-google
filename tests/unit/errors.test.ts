import { describe, expect, it } from "vitest";
import { AppError, mapGoogleApiError, toFailureResult } from "../../src/utils/errors.js";

describe("error mapping", () => {
  it("maps 401 to AUTHENTICATION_REQUIRED", () => {
    const mapped = mapGoogleApiError({ code: 401, message: "Invalid Credentials" });
    expect(mapped.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("maps 403 to PERMISSION_DENIED", () => {
    const mapped = mapGoogleApiError({ code: 403, message: "Forbidden" });
    expect(mapped.code).toBe("PERMISSION_DENIED");
  });

  it("maps 404 to DOCUMENT_NOT_FOUND", () => {
    const mapped = mapGoogleApiError({ code: 404, message: "Not Found" });
    expect(mapped.code).toBe("DOCUMENT_NOT_FOUND");
  });

  it("marks 429 as retryable GOOGLE_API_ERROR", () => {
    const mapped = mapGoogleApiError({ code: 429, message: "Rate limited" });
    expect(mapped.code).toBe("GOOGLE_API_ERROR");
    expect(mapped.retryable).toBe(true);
  });

  it("converts AppError to failure envelope", () => {
    const failure = toFailureResult(
      new AppError("VALIDATION_ERROR", "bad input"),
    );
    expect(failure).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "bad input",
        retryable: false,
      },
    });
  });
});
