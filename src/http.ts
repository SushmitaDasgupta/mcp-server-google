#!/usr/bin/env node
import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config as loadDotenv } from "dotenv";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./mcp/server.js";
import {
  extractApiKeyFromNodeRequest,
  isValidApiKey,
} from "./middleware/apiKey.js";
import { assertMcpApiKey, loadConfig } from "./utils/config.js";
import { logger } from "./utils/logger.js";

loadDotenv();

const config = loadConfig();
assertMcpApiKey(config);

const mcpHandler = createMcpHandler(() => createServer(config), {
  onerror: (error) => {
    logger.error("MCP handler error", {
      reason: error.message,
    });
  },
});

const nodeMcpHandler = toNodeHandler(mcpHandler);

function sendJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function pathnameOf(req: IncomingMessage): string {
  try {
    const host = req.headers.host ?? "localhost";
    return new URL(req.url ?? "/", `http://${host}`).pathname;
  } catch {
    return "/";
  }
}

function requireMcpAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const provided = extractApiKeyFromNodeRequest(req);
  if (isValidApiKey(provided, config.mcpApiKey)) {
    return true;
  }
  sendJson(
    res,
    401,
    { error: "Unauthorized" },
    { "WWW-Authenticate": 'Bearer realm="mcp", error="invalid_token"' },
  );
  return false;
}

const httpServer = createHttpServer((req, res) => {
  const pathname = pathnameOf(req);
  const method = req.method ?? "GET";

  if (method === "GET" && (pathname === "/health" || pathname === "/")) {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (pathname === "/mcp") {
    if (!requireMcpAuth(req, res)) {
      return;
    }
    void nodeMcpHandler(req, res);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

const host = "0.0.0.0";
const { port } = config;

httpServer.listen(port, host, () => {
  logger.info(`${SERVER_NAME} v${SERVER_VERSION} listening`, {
    host,
    port,
    health: `http://${host}:${port}/health`,
    mcp: `http://${host}:${port}/mcp`,
  });
});

async function shutdown(signal: string): Promise<void> {
  logger.info("Shutting down HTTP server", { signal });
  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });
  await mcpHandler.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
