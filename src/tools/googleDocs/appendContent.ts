import type { GoogleDocsService } from "../../types/index.js";
import type { AppendContentInputSchema } from "../../schemas/googleDocsSchema.js";
import { runTool } from "../shared.js";

export function createAppendContentHandler(docs: GoogleDocsService) {
  return async (args: AppendContentInputSchema) =>
    runTool("google_docs_append_content", () =>
      docs.appendContent(args.documentId, args.content),
    );
}
