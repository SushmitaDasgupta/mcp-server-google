import type { GmailService } from "../../types/index.js";
import type { SendEmailInputSchema } from "../../schemas/emailSchema.js";
import { runTool } from "../shared.js";

export function createSendEmailHandler(gmail: GmailService) {
  return async (args: SendEmailInputSchema) =>
    runTool("gmail_send_email", () => gmail.sendEmail(args));
}
