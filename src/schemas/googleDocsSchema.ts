import { z } from "zod/v4";
import { LIMITS } from "../utils/validation.js";

export const appendContentInputSchema = z.object({
  documentId: z
    .string()
    .min(1)
    .max(LIMITS.maxDocumentIdLength)
    .describe("Google Docs document ID (from the document URL)."),
  content: z
    .string()
    .min(1)
    .max(LIMITS.maxDocContentLength)
    .describe("Plain text to append to the end of the document."),
});

export type AppendContentInputSchema = z.infer<typeof appendContentInputSchema>;
