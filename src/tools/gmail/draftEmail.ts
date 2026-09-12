import type { GmailService } from "../../types/index.js";
import type { EmailInputSchema } from "../../schemas/emailSchema.js";
import { runTool } from "../shared.js";

export function createDraftEmailHandler(gmail: GmailService) {
  return async (args: EmailInputSchema) =>
    runTool("gmail_draft_email", () => gmail.draftEmail(args));
}
