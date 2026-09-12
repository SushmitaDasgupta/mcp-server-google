# Deployment Plan — Google Workspace MCP Server on Railway

## 1. Goal

Deploy this MCP server as a **remote, always-on HTTPS endpoint** on [Railway](https://railway.app), so any MCP-compatible client (Cursor, Claude Desktop, custom agents) can call Gmail and Google Docs tools without running the server locally.

**Target endpoint (example):**

```text
https://<service>.up.railway.app/mcp
```

---

## 2. Current State vs Railway Requirements

| Area | Today (local) | Required for Railway |
|---|---|---|
| Transport | **stdio** (`serveStdio`) | **Streamable HTTP** (`createMcpHandler` + Node HTTP) |
| Process model | Spawned by MCP client | Long-running web service listening on `PORT` |
| Config | `.env` + `token.json` on disk | Railway **Variables** + durable token storage |
| Auth to Google | Interactive `npm run auth` | Non-interactive refresh token / pre-provisioned credentials |
| Auth to MCP | None (local trust) | **API key / bearer token** in front of `/mcp` |
| Health checks | N/A | `GET /health` (or `/`) for Railway |
| Secrets | Local files (gitignored) | Railway secrets; never commit `credential.json` / `token.json` |

**Critical gap:** Railway cannot usefully host a stdio-only MCP server. Clients connect over the network, so an HTTP transport is mandatory before deploy.

---

## 3. Target Architecture on Railway

```text
┌──────────────────────────┐
│  MCP Client (Cursor etc) │
└────────────┬─────────────┘
             │ HTTPS + Bearer/API key
             ▼
┌──────────────────────────────────────────────┐
│              Railway Service                 │
│                                              │
│  GET  /health     → liveness                 │
│  POST /mcp        → MCP Streamable HTTP      │
│                                              │
│  Auth middleware → createMcpHandler factory  │
│         │                                    │
│         ▼                                    │
│  Tools → GmailService / DocsService          │
│         │                                    │
│         ▼                                    │
│  Google OAuth refresh token → Google APIs    │
└──────────────────────────────────────────────┘
```

Keep the existing layered design (`tools → services → auth → Google APIs`). Only the **entry transport** and **credential storage** change for cloud.

---

## 4. Implementation Work Before Deploy

### Phase A — HTTP transport (blocking)

Add a Railway-ready entrypoint alongside stdio (do not remove local stdio support).

**Recommended approach (MCP SDK v2):**

1. Reuse `createServer(config)` factory from `src/mcp/server.ts`.
2. Add `src/http.ts` that:
   - Reads `PORT` (Railway injects this; default `3000` locally).
   - Serves `GET /health` → `{ "status": "ok" }`.
   - Serves MCP via `createMcpHandler(() => createServer(config))`.
   - Mounts with `@modelcontextprotocol/node` (`toNodeHandler`) or `createMcpExpressApp`.
3. Protect `/mcp` with shared-secret auth (see Phase B).
4. Update `package.json`:

```json
{
  "scripts": {
    "start": "node dist/http.js",
    "start:stdio": "node dist/index.js",
    "dev:http": "tsx src/http.ts"
  }
}
```

Railway should run **`npm run build` then `npm start`** (HTTP), not stdio.

### Phase B — Protect the public MCP endpoint (blocking)

Anyone with the Railway URL could invoke Gmail/Docs tools unless gated.

**Minimum V1:**

| Variable | Purpose |
|---|---|
| `MCP_API_KEY` | Shared secret clients send as `Authorization: Bearer <key>` or `X-API-Key` |

Reject unauthenticated `/mcp` requests with `401`. Do **not** put this key in the repo.

Optional later: OAuth for MCP clients, IP allowlists, per-user Google tokens.

### Phase C — Google credentials on Railway (blocking)

Interactive browser OAuth (`npm run auth`) does not work well as the primary Railway bootstrap.

**Recommended V1 approach (single Google account):**

1. Run `npm run auth` **once locally** (already done → `token.json`).
2. Store on Railway Variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN` (from `token.json`)
3. Update `TokenManager` / `GoogleAuth` to:
   - Prefer `GOOGLE_REFRESH_TOKEN` from env when no writable token file exists.
   - Optionally persist refreshed access tokens to a volume or skip disk writes in production.

**Avoid:** relying on ephemeral container disk for `token.json` alone — Railway filesystems are not durable across redeploys unless you attach a volume.

**Optional later:**

- Railway Volume mounted at e.g. `/data` with `GOOGLE_TOKEN_PATH=/data/token.json`
- Per-user OAuth (multi-tenant) — out of scope for first Railway deploy

### Phase D — Production config & redirects

| Variable | Railway value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Set by Railway (do not hardcode) |
| `LOG_LEVEL` | `info` |
| `GOOGLE_CLIENT_ID` | From Google Cloud |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud |
| `GOOGLE_REFRESH_TOKEN` | From local `token.json` |
| `GOOGLE_REDIRECT_URI` | Keep for local re-auth; not required at runtime if refresh token is present |
| `MCP_API_KEY` | Long random secret |
| `GOOGLE_TOKEN_PATH` | Optional; use only with a Volume |

In Google Cloud Console:

- Keep Desktop OAuth client for local auth, **or**
- Add a Web client if you later add hosted OAuth re-consent with `https://<railway-domain>/oauth2callback`

Enable APIs (already required locally): Gmail API, Google Docs API.

### Phase E — Repo hygiene for deploy

- Ensure `.gitignore` includes: `.env`, `token.json`, `credential.json`, `.tokens/`
- Add `railway.toml` or rely on Railway UI for build/start
- Optional `Dockerfile` for reproducible builds (Node 20+)
- Do **not** commit secrets; rotate if they were ever committed or pasted into chat logs

---

## 5. Railway Project Setup

### 5.1 Create service

1. Push this repo to GitHub (private recommended).
2. Railway → **New Project** → **Deploy from GitHub repo**.
3. Select the MCP Server repository and branch (`main`).

### 5.2 Build & start

**Nixpacks / Railpack (default):**

| Setting | Value |
|---|---|
| Build command | `npm ci && npm run build` |
| Start command | `npm start` → `node dist/http.js` |
| Node version | `20` or `22` (`engines.node` already `>=20`) |

**Optional `railway.toml`:**

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm ci && npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
```

### 5.3 Networking

1. Settings → **Networking** → **Generate Domain** (or custom domain).
2. Confirm HTTPS URL is provisioned (`*.up.railway.app`).
3. Public path for clients: `https://<service>.up.railway.app/mcp`

### 5.4 Health check

Expose `GET /health` returning `200` so Railway can detect healthy deploys and restarts.

---

## 6. Environment Variables Checklist (Railway)

Set these in Railway → Variables (service scope):

```env
NODE_ENV=production
LOG_LEVEL=info

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...

MCP_API_KEY=...   # generate: openssl rand -hex 32
```

Optional:

```env
GOOGLE_TOKEN_PATH=/data/token.json   # only if Volume attached
GOOGLE_REDIRECT_URI=https://<domain>/oauth2callback   # only if hosted OAuth added
```

---

## 7. Client Connection After Deploy

### Cursor (remote MCP)

Example shape (exact UI fields may vary by Cursor version):

```json
{
  "mcpServers": {
    "google-workspace": {
      "url": "https://<service>.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_API_KEY>"
      }
    }
  }
}
```

If the client only supports stdio locally, keep using local `npm run dev` / `start:stdio`, or use a small local proxy that speaks stdio ↔ remote HTTP.

### Smoke tests post-deploy

```bash
# Health
curl -sS https://<service>.up.railway.app/health

# Unauthenticated MCP should fail
curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://<service>.up.railway.app/mcp

# Authenticated tool list / call via MCP Inspector or Cursor
```

Manual tool checks:

1. `gmail_draft_email` — create a draft (safe).
2. `google_docs_append_content` — append to a test Doc.
3. Avoid `gmail_send_email` until draft path is confirmed.

---

## 8. Security Plan

| Control | Action |
|---|---|
| Transport | HTTPS only (Railway default) |
| MCP access | Require `MCP_API_KEY` on `/mcp` |
| Google secrets | Railway Variables only |
| Scopes | Keep minimal (compose / send / documents) |
| Logging | Never log tokens, client secrets, or full email bodies |
| Repo | Private GitHub; secrets gitignored |
| Side effects | Prefer draft over send in early production testing |
| Rotation | Document how to rotate `MCP_API_KEY` and Google client secret |

**Threat note:** A leaked Railway URL + API key equals Gmail send + Docs append as the linked Google account. Treat `MCP_API_KEY` like a password.

---

## 9. Operational Concerns

### Cold starts / sleep

- On free/hobby plans, services may sleep; first MCP call can be slow.
- For agent reliability, prefer an always-on plan or a keep-alive ping to `/health`.

### Token refresh

- Access tokens expire; refresh must work from `GOOGLE_REFRESH_TOKEN`.
- Monitor logs for `AUTHENTICATION_REQUIRED`; re-run local auth and update Railway var if refresh token is revoked.

### Idempotency

- In-memory idempotency for `gmail_send_email` **does not survive** multi-instance restarts/scale-out.
- For a single Railway replica this is acceptable for V1; for scale-out, move the store to Redis/Postgres later.

### Scaling

- Start with **1 replica**. Stateless HTTP + env refresh token scales later; shared idempotency and rate limits become necessary at >1.

### Observability

- Use Railway logs (structured JSON already goes to stderr).
- Optional: add request ID already present in tool logs; consider Railway metrics on `/health` latency.

---

## 10. Rollout Phases

| Phase | Work | Exit criteria |
|---|---|---|
| **0 — Prep** | HTTP entrypoint, API key middleware, env-based refresh token, `/health` | Local `npm run dev:http` works with Inspector |
| **1 — Railway wire-up** | GitHub connect, build/start, vars, public domain | `/health` returns 200 on Railway URL |
| **2 — Auth smoke** | Client connects with API key; `tools/list` succeeds | All 3 tools visible remotely |
| **3 — Capability smoke** | Remote `gmail_draft_email` + Docs append | Success envelopes; no secret leakage in logs |
| **4 — Harden** | Confirm send path, rotate keys if needed, document runbook | Ready for daily use |
| **5 — Optional** | Volume for tokens, custom domain, Dockerfile, multi-user OAuth | As needed |

---

## 11. Suggested File Changes (implementation backlog)

```text
src/http.ts                  # NEW — Railway HTTP entry
src/mcp/server.ts            # reuse factory as-is
src/auth/googleAuth.ts       # accept GOOGLE_REFRESH_TOKEN from env
src/auth/tokenManager.ts     # optional no-disk / volume mode
src/middleware/apiKey.ts     # NEW — MCP_API_KEY gate
package.json                 # start → dist/http.js
railway.toml                 # optional
Dockerfile                   # optional
docs/deployment-plan.md      # this file
README.md                    # add “Deploy on Railway” section after impl
```

Local stdio path (`src/index.ts`) stays for desktop MCP configs.

---

## 12. Definition of Done (Railway)

- [ ] Service builds and stays healthy on Railway
- [ ] `GET /health` returns 200
- [ ] `POST /mcp` requires API key
- [ ] Cursor (or Inspector) lists all three tools over HTTPS
- [ ] `gmail_draft_email` works against the linked Google account
- [ ] `google_docs_append_content` works on a test Doc
- [ ] No secrets in git or build logs
- [ ] README documents remote URL + client header setup
- [ ] Runbook exists for refresh-token revocation and key rotation

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Deploying stdio as-is | Service “runs” but no client can connect | Ship HTTP transport first |
| Ephemeral `token.json` | Auth breaks on redeploy | Use `GOOGLE_REFRESH_TOKEN` env (or Volume) |
| Open `/mcp` without API key | Anyone can send mail as you | Mandatory `MCP_API_KEY` |
| Refresh token revoked | All tools fail with auth errors | Re-auth locally; update Railway var |
| Multi-replica idempotency gaps | Duplicate sends | Single replica V1; external store later |
| Logging PII | Privacy/compliance issue | Keep current redaction; avoid body logs |

---

## 14. Decision Summary

| Decision | Choice for first Railway deploy |
|---|---|
| Platform | Railway (HTTPS web service) |
| MCP transport | Streamable HTTP on `/mcp` |
| Local support | Keep stdio entry for desktop |
| Google auth | Env `GOOGLE_REFRESH_TOKEN` from one-time local OAuth |
| MCP auth | Shared `MCP_API_KEY` |
| Replicas | 1 |
| Docs/Gmail verification | Draft + append before enabling routine sends |

---

## 15. Next Action

Implement **Phase 0** code changes (`src/http.ts`, API key gate, env refresh token), verify locally with MCP Inspector over HTTP, then connect the GitHub repo to Railway and apply the Variables checklist in §6.

Related: [architecture.md](./architecture.md) · [README.md](../README.md)
