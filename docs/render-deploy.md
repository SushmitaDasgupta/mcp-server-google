# Render deploy notes

This service is configured for [Render](https://render.com) via [`render.yaml`](../render.yaml).

## Service settings (manual dashboard)

If you are not using Blueprint sync, match these:

| Field | Value |
|---|---|
| Type | Web Service |
| Language / Runtime | Node |
| Branch | `main` |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

Render injects `PORT`; `src/http.ts` already binds `0.0.0.0:$PORT`.

## Environment

Boot and health checks work with no secrets.

Optional later:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `MCP_API_KEY` (gates `/mcp` when set)

## Endpoints

- `GET /health` — liveness
- `POST /mcp` — MCP Streamable HTTP

Related: [deployment-plan.md](./deployment-plan.md) (Railway-oriented original plan; same HTTP entrypoint applies).
