import { AppError } from "./errors.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LIMITS = {
  maxRecipients: 100,
  maxSubjectLength: 998,
  maxBodyLength: 100_000,
  maxDocumentIdLength: 256,
  maxDocContentLength: 500_000,
} as const;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function assertValidEmails(
  field: string,
  emails: string[] | undefined,
  { required = false }: { required?: boolean } = {},
): string[] {
  const list = emails ?? [];

  if (required && list.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `At least one ${field} recipient is required.`,
    );
  }

  if (list.length > LIMITS.maxRecipients) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Too many ${field} recipients (max ${LIMITS.maxRecipients}).`,
    );
  }

  const invalid = list.filter((e) => !isValidEmail(e));
  if (invalid.length > 0) {
    throw new AppError(
      "INVALID_EMAIL",
      `One or more ${field} email addresses are invalid: ${invalid.join(", ")}`,
    );
  }

  return list.map((e) => e.trim());
}

export function assertNonEmptyString(
  field: string,
  value: unknown,
  maxLength: number,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError("VALIDATION_ERROR", `${field} is required.`);
  }
  if (value.length > maxLength) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${field} exceeds maximum length of ${maxLength} characters.`,
    );
  }
  return value;
}
