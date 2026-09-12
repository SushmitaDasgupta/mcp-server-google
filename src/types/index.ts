export type ErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_EMAIL"
  | "DOCUMENT_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "GOOGLE_API_ERROR"
  | "VALIDATION_ERROR"
  | "NETWORK_ERROR";

export interface AppErrorBody {
  code: ErrorCode;
  message: string;
  retryable?: boolean;
}

export interface SuccessResult {
  success: true;
  message: string;
}

export interface FailureResult {
  success: false;
  error: AppErrorBody;
}

export type ToolResult<T extends SuccessResult = SuccessResult> =
  | T
  | FailureResult;

export interface EmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  idempotencyKey?: string;
}

export interface EmailDraftResult extends SuccessResult {
  draftId: string;
}

export interface EmailSendResult extends SuccessResult {
  messageId: string;
  threadId?: string;
}

export interface AppendContentResult extends SuccessResult {
  documentId: string;
}

export interface GmailService {
  draftEmail(input: EmailInput): Promise<EmailDraftResult>;
  sendEmail(input: EmailInput): Promise<EmailSendResult>;
}

export interface GoogleDocsService {
  appendContent(
    documentId: string,
    content: string,
  ): Promise<AppendContentResult>;
}
