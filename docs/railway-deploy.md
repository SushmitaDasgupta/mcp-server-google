# Railway deploy

This service is configured for [Railway](https://railway.app) via [`railway.toml`](../railway.toml).

## Service settings

| Field | Value |
|---|---|
| Type | Web service |
| Builder | Nixpacks (see `railway.toml`) |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` → `node dist/http.js` |
| Health Check Path | `/health` |
| Node | `22` (see `.node-version`) |

Railway injects `PORT`; `src/http.ts` binds `0.0.0.0:$PORT`.

## Environment variables

Set these in Railway → Variables:

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | Yes | `production` |
| `GOOGLE_CLIENT_ID` | For tools | Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | For tools | Google Cloud OAuth client |
| `GOOGLE_TOKENS_JSON` | For tools | Full contents of local `token.json` (one line) |
| `MCP_API_KEY` | Recommended | Gates `/mcp`; clients send `Authorization: Bearer <key>` |
| `LOG_LEVEL` | Optional | Default `info` |

Optional fallback: `GOOGLE_REFRESH_TOKEN` (refresh token string only) if `GOOGLE_TOKENS_JSON` is unset.

Generate `GOOGLE_TOKENS_JSON` locally after `npm run auth`:

```bash
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('token.json','utf8'))))"
```

## Endpoints

- `GET /health` — liveness
- `POST /mcp` — MCP Streamable HTTP

Public URL shape: `https://<service>.up.railway.app/mcp`

## Smoke test

```bash
curl -sS https://<service>.up.railway.app/health
```

## Rotate secrets

| Secret | Action |
|---|---|
| `MCP_API_KEY` | New key → update Railway Variables + MCP client configs |
| Google client secret | Rotate in Google Cloud → update `GOOGLE_CLIENT_SECRET` |
| Tokens revoked | Run `npm run auth` locally → replace `GOOGLE_TOKENS_JSON` |

Related: [deployment-plan.md](./deployment-plan.md) (full design / rollout checklist).
