import type { AppErrorBody, ErrorCode, FailureResult } from "../types/index.js";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.retryable = retryable;
  }

  toBody(): AppErrorBody {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }

  toFailure(): FailureResult {
    return { success: false, error: this.toBody() };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toFailureResult(error: unknown): FailureResult {
  if (isAppError(error)) {
    return error.toFailure();
  }

  if (error instanceof Error) {
    return {
      success: false,
      error: {
        code: "GOOGLE_API_ERROR",
        message: error.message || "An unexpected error occurred.",
        retryable: false,
      },
    };
  }

  return {
    success: false,
    error: {
      code: "GOOGLE_API_ERROR",
      message: "An unexpected error occurred.",
      retryable: false,
    },
  };
}

/**
 * Map Google API / Gaxios errors into canonical AppError codes.
 */
export function mapGoogleApiError(error: unknown): AppError {
  const status =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "number"
      ? (error as { code: number }).code
      : undefined;

  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
      ? (error as { message: string }).message
      : "Google API request failed.";

  const lower = message.toLowerCase();

  if (
    status === 401 ||
    lower.includes("invalid_grant") ||
    lower.includes("login required") ||
    lower.includes("auth")
  ) {
    if (status === 401 || lower.includes("invalid_grant")) {
      return new AppError(
        "AUTHENTICATION_REQUIRED",
        "Google authentication is required. Run `npm run auth` to sign in.",
      );
    }
  }

  if (status === 403 || lower.includes("permission") || lower.includes("forbidden")) {
    return new AppError(
      "PERMISSION_DENIED",
      "The authenticated Google account does not have permission for this operation.",
    );
  }

  if (status === 404 || lower.includes("not found")) {
    return new AppError(
      "DOCUMENT_NOT_FOUND",
      "The requested Google Doc could not be found.",
    );
  }

  if (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return new AppError(
      "GOOGLE_API_ERROR",
      "Google API request failed.",
      true,
    );
  }

  if (
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("network")
  ) {
    return new AppError(
      "NETWORK_ERROR",
      "Network error while contacting Google APIs.",
      true,
    );
  }

  return new AppError("GOOGLE_API_ERROR", message, false);
}
