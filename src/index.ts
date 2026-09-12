#!/usr/bin/env node
import { config as loadDotenv } from "dotenv";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./mcp/server.js";
import { loadConfig } from "./utils/config.js";
import { logger } from "./utils/logger.js";

loadDotenv();

const config = loadConfig();

void serveStdio(() => createServer(config));

logger.info(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
