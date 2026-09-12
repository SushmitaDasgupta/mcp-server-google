import { z } from "zod/v4";
import { LIMITS } from "../utils/validation.js";

const emailAddress = z
  .email()
  .describe("A valid email address.");

export const emailInputSchema = z.object({
  to: z
    .array(emailAddress)
    .min(1)
    .max(LIMITS.maxRecipients)
    .describe("Primary email recipients."),
  cc: z
    .array(emailAddress)
    .max(LIMITS.maxRecipients)
    .optional()
    .describe("CC recipients."),
  bcc: z
    .array(emailAddress)
    .max(LIMITS.maxRecipients)
    .optional()
    .describe("BCC recipients."),
  subject: z
    .string()
    .min(1)
    .max(LIMITS.maxSubjectLength)
    .describe("Email subject."),
  body: z
    .string()
    .min(1)
    .max(LIMITS.maxBodyLength)
    .describe("Plain-text email body."),
});

export const sendEmailInputSchema = emailInputSchema.extend({
  idempotencyKey: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe(
      "Optional key to prevent duplicate sends on retries. Reusing the same key returns the prior result.",
    ),
});

export type EmailInputSchema = z.infer<typeof emailInputSchema>;
export type SendEmailInputSchema = z.infer<typeof sendEmailInputSchema>;
