import { createServer } from "node:http";
import { URL } from "node:url";
import { config as loadDotenv } from "dotenv";
import { GoogleAuth } from "../auth/googleAuth.js";
import { loadConfig } from "../utils/config.js";
import { logger } from "../utils/logger.js";

loadDotenv();

async function main(): Promise<void> {
  const config = loadConfig();
  const auth = new GoogleAuth(config);
  const client = auth.createOAuth2Client();

  const redirect = new URL(config.googleRedirectUri);
  const port = Number(redirect.port || 3000);
  const callbackPath = redirect.pathname === "" ? "/" : redirect.pathname;

  const authUrl = auth.getAuthUrl(client);
  logger.info("Open this URL in your browser to authorize Google access", {
    url: authUrl,
  });
  console.error("\nAuthorize this app by visiting:\n");
  console.error(authUrl);
  console.error("\nWaiting for OAuth callback...\n");

  await new Promise<void>((resolve, reject) => {
    const server = createServer((req, res) => {
      void (async () => {
        try {
          if (!req.url) {
            res.writeHead(400);
            res.end("Bad request");
            return;
          }

          const requestUrl = new URL(req.url, `http://localhost:${port}`);
          const pathMatches =
            requestUrl.pathname === callbackPath ||
            (callbackPath === "/" &&
              (requestUrl.pathname === "/" ||
                requestUrl.pathname === "/oauth2callback"));
          if (!pathMatches) {
            res.writeHead(404);
            res.end("Not found");
            return;
          }

          const error = requestUrl.searchParams.get("error");
          if (error) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end(`Authorization failed: ${error}`);
            server.close();
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          const code = requestUrl.searchParams.get("code");
          if (!code) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Missing authorization code");
            return;
          }

          await auth.exchangeCode(client, code);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h1>Authorization successful</h1><p>You can close this window and return to the terminal.</p></body></html>",
          );
          server.close();
          resolve();
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Failed to exchange authorization code");
          server.close();
          reject(err);
        }
      })();
    });

    server.listen(port, "127.0.0.1", () => {
      logger.info("OAuth callback server listening", { port, path: callbackPath });
    });

    server.on("error", reject);
  });

  console.error(
    "Tokens saved. You can now start the MCP server with `npm run dev` (stdio) or `npm run dev:http`.\n",
  );
  console.error(
    "For Railway: copy refresh_token from your token file into GOOGLE_REFRESH_TOKEN.\n",
  );
}

main().catch((error) => {
  console.error(
    "Authentication failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
