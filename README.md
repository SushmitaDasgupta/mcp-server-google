# Google Workspace MCP Server

Generic [Model Context Protocol](https://modelcontextprotocol.io) server that lets any MCP-compatible AI agent draft/send Gmail messages and append content to Google Docs.

## What it does

| Tool | Description |
|---|---|
| `gmail_draft_email` | Create a Gmail draft (not sent) |
| `gmail_send_email` | Send a plain-text email (external side effect) |
| `google_docs_append_content` | Append text to the end of an existing Google Doc |

The server is agent-agnostic: any MCP client can discover and call these tools.

## Architecture

```text
AI Agent (MCP client)
        │
        ▼
MCP Server (tools, validation, auth, errors, logs)
        │
   ┌────┴────┐
   ▼         ▼
Gmail API   Docs API
```

Layers:

- **MCP tools** — thin handlers with Zod schemas
- **Domain services** — Gmail / Docs logic (mockable)
- **Auth** — Google OAuth 2.0 + token persistence
- **Utils** — validation, canonical errors, structured logging

See [docs/architecture.md](docs/architecture.md) for the full design.

## Prerequisites

- Node.js 20+
- A Google Cloud project with OAuth 2.0 credentials
- Gmail API and Google Docs API enabled

## Google Cloud setup

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable APIs:
   - **Gmail API**
   - **Google Docs API**
4. Configure the OAuth consent screen (External or Internal).
5. Create **OAuth client ID** credentials:
   - Application type: **Desktop app** (recommended for local MCP)  
     or **Web application** with redirect URI `http://localhost:3000/oauth2callback`
6. Copy the Client ID and Client Secret.

### OAuth scopes (requested automatically)

```text
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/documents
```

## Local setup

```bash
git clone <repository>
cd "MCP Server"

npm install
cp .env.example .env
```

Edit `.env`:

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_TOKEN_PATH=.tokens/google-tokens.json
MCP_API_KEY=                      # optional; when set, required on /mcp
LOG_LEVEL=info
```

### Authenticate once

```bash
npm run auth
```

Open the printed URL, sign in with Google, and approve the scopes. Tokens are saved to `GOOGLE_TOKEN_PATH` (gitignored).

### Run the server (stdio — local clients)

```bash
npm run dev
```

Or build and run stdio:

```bash
npm run build
npm run start:stdio
```

### Run the server (HTTP — Render / remote clients)

```bash
npm run dev:http
```

Or:

```bash
npm run build
npm start
```

Health: `GET /health` → `{ "status": "ok" }`  
MCP: `POST /mcp` — if `MCP_API_KEY` is set, send `Authorization: Bearer <key>` or `X-API-Key`

Logs go to **stderr** (stdout is reserved for MCP JSON-RPC on stdio).

## Connect an MCP client

### Cursor

Add to MCP settings (example):

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/MCP Server/src/index.ts"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret",
        "GOOGLE_REDIRECT_URI": "http://localhost:3000/oauth2callback",
        "GOOGLE_TOKEN_PATH": "/absolute/path/to/MCP Server/.tokens/google-tokens.json"
      }
    }
  }
}
```

After `npm run build`, you can point `command` at `node` and `args` at `dist/index.js`.

### Cursor (remote HTTP)

```json
{
  "mcpServers": {
    "google-workspace": {
      "url": "https://<service>.onrender.com/mcp"
    }
  }
}
```

If you set `MCP_API_KEY` on Render, also send:

```json
"headers": {
  "Authorization": "Bearer <MCP_API_KEY>"
}
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

For HTTP:

```bash
npm run dev:http
# then point Inspector at http://localhost:3000/mcp
```

## Deploy on Render

This repo includes [`render.yaml`](render.yaml) for a Render Web Service.

| Setting | Value |
|---|---|
| Runtime | Node |
| Build | `npm ci && npm run build` |
| Start | `npm start` → `node dist/http.js` |
| Health check | `/health` |
| Node | `22` (see `.node-version`) |

1. Connect [SushmitaDasgupta/mcp-server-google](https://github.com/SushmitaDasgupta/mcp-server-google) in Render (or apply the Blueprint).
2. Public MCP URL: `https://<service>.onrender.com/mcp`
3. Env vars are **optional** for boot/`/health`. Add later when tools should call Google:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
# MCP_API_KEY=...   # optional
```

4. Smoke test:

```bash
curl -sS https://<service>.onrender.com/health
```

Free-tier services may sleep when idle; the first request after idle can be slow.

### Runbook — rotate secrets

| Secret | Rotation |
|---|---|
| `MCP_API_KEY` | Generate a new key, update Render env + client configs |
| Google client secret | Rotate in Google Cloud Console, update `GOOGLE_CLIENT_SECRET` |
| Refresh token revoked | Run `npm run auth` locally, copy new `refresh_token` into `GOOGLE_REFRESH_TOKEN` |

Treat a public `/mcp` URL (especially without `MCP_API_KEY`) as full access to the linked Google account’s Gmail/Docs tools.

## Deploy on Railway (optional)

See [docs/deployment-plan.md](docs/deployment-plan.md). Same build/start commands; `railway.toml` remains for Railway hosts.

## Available tools

### `gmail_draft_email`

Creates a draft only — does **not** send.

```json
{
  "to": ["recipient@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Email subject",
  "body": "Email body"
}
```

### `gmail_send_email`

Sends immediately to external recipients and **cannot be automatically undone**.

```json
{
  "to": ["recipient@example.com"],
  "subject": "Email subject",
  "body": "Email body",
  "idempotencyKey": "optional-unique-key"
}
```

Optional `idempotencyKey` prevents duplicate sends when an agent retries the same operation.

### `google_docs_append_content`

Appends plain text at the end of an existing document (preserves existing content).

```json
{
  "documentId": "1AbCdEfGhIjKlMnOp",
  "content": "Text to append"
}
```

The document ID is the long ID in the Docs URL:  
`https://docs.google.com/document/d/<documentId>/edit`

## Example agent flows

**Send email**

```text
User: Send an email to John saying the meeting moved to 4 PM.
Agent → gmail_send_email
```

**Append meeting notes**

```text
User: Add today's notes to the project Google Doc.
Agent → google_docs_append_content
```

## Error model

Tools return a JSON envelope:

```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "Google authentication is required.",
    "retryable": false
  }
}
```

Common codes: `AUTHENTICATION_REQUIRED`, `INVALID_EMAIL`, `DOCUMENT_NOT_FOUND`, `PERMISSION_DENIED`, `VALIDATION_ERROR`, `GOOGLE_API_ERROR`, `NETWORK_ERROR`.

## Security

- Never commit `.env`, `credential.json`, or token files.
- Tokens, client secrets, and `MCP_API_KEY` are never logged.
- HTTP `/mcp` is open unless `MCP_API_KEY` is set (`Authorization: Bearer` or `X-API-Key`).
- OAuth scopes are minimized to compose, send, and documents.
- Prefer drafting (`gmail_draft_email`) when send is not required.
- Use HTTPS redirect URIs for non-local deployments.

## Testing

```bash
npm test
```

Unit tests cover validation, MIME/Base64URL encoding, Docs append request construction, error mapping, and tool handlers with mocked services. No Google credentials are required for the default suite.

## Troubleshooting

| Issue | Fix |
|---|---|
| `AUTHENTICATION_REQUIRED` | Run `npm run auth` or set `GOOGLE_REFRESH_TOKEN`; ensure OAuth client env vars are set |
| `401` on `/mcp` | Set/send `MCP_API_KEY` as Bearer or `X-API-Key` |
| `PERMISSION_DENIED` on Docs | Confirm the signed-in account can edit the document |
| `DOCUMENT_NOT_FOUND` | Check the document ID from the Docs URL |
| OAuth redirect mismatch | Align `GOOGLE_REDIRECT_URI` with the Cloud Console redirect URI |
| Client cannot list tools | Confirm the server starts (`npm run dev` or `dev:http`) and MCP config paths/URL are correct |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Run MCP server over stdio via `tsx` |
| `npm run dev:http` | Run Streamable HTTP server (`PORT`; optional `MCP_API_KEY`) |
| `npm run auth` | Interactive Google OAuth login |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled HTTP server (`dist/http.js`) |
| `npm run start:stdio` | Run compiled stdio server (`dist/index.js`) |
| `npm test` | Run unit tests |
| `npm run lint` | Typecheck |

## Future extensions

The layered layout supports adding tools such as `gmail_search_emails`, `google_docs_create`, Sheets, and Calendar without changing the MCP client contract.

## License

MIT
