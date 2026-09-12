import { describe, expect, it } from "vitest";
import { isValidEmail, assertValidEmails, assertNonEmptyString } from "../../src/utils/validation.js";
import { AppError } from "../../src/utils/errors.js";

describe("validation", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("requires at least one to recipient", () => {
    expect(() => assertValidEmails("to", [], { required: true })).toThrow(
      AppError,
    );
  });

  it("flags invalid recipient addresses", () => {
    try {
      assertValidEmails("to", ["ok@example.com", "bad"], { required: true });
      expect.fail("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("INVALID_EMAIL");
    }
  });

  it("enforces non-empty strings and max length", () => {
    expect(() => assertNonEmptyString("subject", "  ", 10)).toThrow(AppError);
    expect(() => assertNonEmptyString("body", "too-long-value", 5)).toThrow(
      AppError,
    );
    expect(assertNonEmptyString("subject", "Hello", 10)).toBe("Hello");
  });
});
