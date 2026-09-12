import { McpServer } from "@modelcontextprotocol/server";
import { GoogleAuth } from "../auth/googleAuth.js";
import { GoogleGmailService } from "../services/gmailService.js";
import { GoogleDocsApiService } from "../services/googleDocsService.js";
import type { AppConfig } from "../utils/config.js";
import { registerTools } from "./toolRegistry.js";

export const SERVER_NAME = "google-workspace-mcp";
export const SERVER_VERSION = "1.0.0";

export function createServer(config: AppConfig): McpServer {
  const auth = new GoogleAuth(config);
  const getAuthClient = () => auth.getAuthenticatedClient();

  const gmail = new GoogleGmailService(getAuthClient);
  const docs = new GoogleDocsApiService(getAuthClient);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server, { gmail, docs });
  return server;
}
