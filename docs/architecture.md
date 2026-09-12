# Architecture — Generic Gmail & Google Docs MCP Server

## 1. Purpose

This document defines the system architecture for a **generic Model Context Protocol (MCP) server** that exposes Gmail and Google Docs capabilities to any MCP-compatible AI agent.

The server is a **capability and integration layer**. It does not own agent reasoning. Agents discover tools, call them with structured inputs, and receive structured results. Google APIs own execution.

**Design priority (V1):** Reliability > Security > Simplicity > Extensibility

---

## 2. Scope

### In scope (V1)

| Capability | Tool | Behavior |
|---|---|---|
| Draft email | `gmail_draft_email` | Create a Gmail draft (not sent) |
| Send email | `gmail_send_email` | Send a plain-text email (external side effect) |
| Append to Doc | `google_docs_append_content` | Append text to the end of an existing Google Doc |

### Out of scope (V1)

- Gmail: read/search, delete, labels, attachments, threads, scheduling, templates
- Docs: create, read, edit sections, search/replace, formatting, images, tables, permissions
- Other Workspace products (Sheets, Calendar) — reserved for future extensions

---

## 3. System Context

```text
┌─────────────────────────────────────────────────────────────────┐
│                         External Actors                          │
│                                                                  │
│   Any MCP-compatible AI Agent / Client                           │
│   (Cursor, Claude Desktop, custom agents, etc.)                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ MCP (stdio / transport)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MCP Server (this system)                     │
│                                                                  │
│   Tool discovery · Schema validation · Auth · Errors · Logs      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
     ┌─────────────────┐              ┌─────────────────┐
     │   Gmail API     │              │ Google Docs API │
     └─────────────────┘              └─────────────────┘
```

**Boundary rules**

- The AI agent owns **reasoning** (when to call which tool, how to phrase content).
- The MCP server owns **capabilities** (validation, auth, orchestration, safe responses).
- Google APIs own **execution** (draft/send/append).
- No agent-specific logic is embedded in the server.

---

## 4. Logical Architecture

### 4.1 Layered design

```text
┌──────────────────────────────────────────┐
│              MCP Interface Layer         │  server, tool registry, schemas
├──────────────────────────────────────────┤
│              Tool Handlers               │  thin adapters: validate → call service → map result
├──────────────────────────────────────────┤
│              Domain Services             │  GmailService, GoogleDocsService
├──────────────────────────────────────────┤
│              Auth & Token Layer          │  OAuth 2.0, token store, scope management
├──────────────────────────────────────────┤
│              Google API Clients          │  official Gmail / Docs SDKs
├──────────────────────────────────────────┤
│         Cross-cutting Concerns           │  validation, errors, logging, config
└──────────────────────────────────────────┘
```

### 4.2 Dependency direction

```text
MCP Tools  →  Domain Services  →  Google API Clients
     │                │
     └────── utils / auth / schemas ──────┘
```

Tools must not call Google APIs directly. Services must not know about MCP protocol details. Auth is shared and injected, not duplicated per tool.

---

## 5. Component Design

### 5.1 MCP layer (`src/mcp/`)

| Component | Responsibility |
|---|---|
| `server` | Bootstrap MCP server, bind transport, wire dependencies |
| `toolRegistry` | Register tools, expose discovery metadata and JSON schemas |

Responsibilities:

- Start/stop lifecycle
- Advertise tools with LLM-friendly descriptions and side-effect warnings
- Route tool invocations to handlers
- Attach request/correlation IDs for observability

### 5.2 Tool handlers (`src/tools/`)

Thin handlers that:

1. Parse and validate input against schemas
2. Call the corresponding domain service
3. Map success/failure into a stable MCP response shape
4. Emit structured logs (no secrets, no tokens)

| Tool | Handler | Service method |
|---|---|---|
| `gmail_draft_email` | `tools/gmail/draftEmail` | `GmailService.draftEmail` |
| `gmail_send_email` | `tools/gmail/sendEmail` | `GmailService.sendEmail` |
| `google_docs_append_content` | `tools/googleDocs/appendContent` | `GoogleDocsService.appendContent` |

### 5.3 Domain services (`src/services/`)

**GmailService**

```typescript
interface GmailService {
  draftEmail(input: EmailInput): Promise<EmailDraftResult>;
  sendEmail(input: EmailInput): Promise<EmailSendResult>;
}
```

Owns: MIME construction, Base64URL encoding, Gmail API draft/send calls, Gmail error mapping.

**GoogleDocsService**

```typescript
interface GoogleDocsService {
  appendContent(
    documentId: string,
    content: string
  ): Promise<AppendContentResult>;
}
```

Owns: document fetch for end index, insertText at end, preserve existing content, Docs error mapping.

Services are **injectable** so unit tests can mock Google without credentials.

### 5.4 Auth layer (`src/auth/`)

| Component | Responsibility |
|---|---|
| `googleAuth` | OAuth 2.0 authorization code / refresh flow |
| `tokenManager` | Load, persist, refresh tokens securely |
| Credentials / config | Client ID, secret, redirect URI from env |

**Scopes (minimal)**

```text
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/documents
```

Auth is orthogonal to tools: every service obtains an authenticated client through the auth layer rather than implementing OAuth itself.

### 5.5 Schemas, types, utils

| Area | Role |
|---|---|
| `schemas/` | JSON Schema / Zod (or equivalent) for tool I/O |
| `types/` | Shared TypeScript types for inputs/results/errors |
| `utils/validation` | Email format, required fields, length limits |
| `utils/errors` | Canonical error codes and mapping from Google errors |
| `utils/logger` | Structured logging with redaction |

---

## 6. Project Structure

Preferred stack: **TypeScript + Node.js** with the official MCP SDK and Google API client libraries.

```text
google-workspace-mcp/
├── src/
│   ├── index.ts
│   ├── mcp/
│   │   ├── server.ts
│   │   └── toolRegistry.ts
│   ├── tools/
│   │   ├── gmail/
│   │   │   ├── draftEmail.ts
│   │   │   └── sendEmail.ts
│   │   └── googleDocs/
│   │       └── appendContent.ts
│   ├── services/
│   │   ├── gmailService.ts
│   │   └── googleDocsService.ts
│   ├── auth/
│   │   ├── googleAuth.ts
│   │   └── tokenManager.ts
│   ├── schemas/
│   │   ├── emailSchema.ts
│   │   └── googleDocsSchema.ts
│   ├── utils/
│   │   ├── errors.ts
│   │   ├── logger.ts
│   │   └── validation.ts
│   └── types/
│       └── index.ts
├── tests/
│   ├── unit/
│   └── integration/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 7. Tool Contracts

### 7.1 Naming convention

`{product}_{action}_{resource?}` — stable, discoverable, LLM-friendly.

V1:

- `gmail_draft_email`
- `gmail_send_email`
- `google_docs_append_content`

Future examples: `gmail_search_emails`, `google_docs_create`, `google_sheets_append`.

### 7.2 `gmail_draft_email`

**Purpose:** Create a draft; do not send.

**Input (required):** `to[]`, `subject`, `body`  
**Input (optional):** `cc[]`, `bcc[]`

**Flow**

```text
validate → build MIME → encode → Gmail drafts.create → return draftId
```

**Success**

```json
{
  "success": true,
  "draftId": "1234567890",
  "message": "Email draft created successfully."
}
```

### 7.3 `gmail_send_email`

**Purpose:** Send email to external recipients. Explicitly destructive / externally visible.

**Input:** Same shape as draft. Optional future field: `idempotencyKey`.

**Flow**

```text
validate → build MIME → Base64URL encode → Gmail messages.send → return messageId, threadId
```

**Safety**

- Tool description must state the action cannot be automatically undone.
- Draft and send must remain distinct tools so agents cannot confuse them.

**Success**

```json
{
  "success": true,
  "messageId": "18c123456789",
  "threadId": "18c123456789",
  "message": "Email sent successfully."
}
```

### 7.4 `google_docs_append_content`

**Purpose:** Append plain text to the end of an existing document.

**Input (required):** `documentId`, `content`

**Flow**

```text
validate → auth → get document end index → insertText at end → return success
```

Must preserve all existing content. Do not silently truncate input.

**Success**

```json
{
  "success": true,
  "documentId": "1AbCdEfGhIjKlMnOp",
  "message": "Content appended successfully."
}
```

---

## 8. Request Lifecycle

```text
MCP Client
    │  tools/call { name, arguments }
    ▼
MCP Server
    │  assign requestId
    │  resolve tool handler
    ▼
Validation
    │  schema + domain rules (emails, lengths, required fields)
    │  fail fast → INVALID_* error
    ▼
Auth Gate
    │  ensure valid access token (refresh if needed)
    │  fail → AUTHENTICATION_REQUIRED
    ▼
Domain Service
    │  Google API call
    │  map Google errors → canonical codes
    ▼
Response
    │  { success, ...data } or { success: false, error }
    │  structured log (tool, requestId, durationMs, success)
    ▼
MCP Client
```

---

## 9. Configuration

Configuration is environment-based; never hard-coded or committed.

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_TOKEN_PATH=
LOG_LEVEL=info
```

Ship `.env.example` with names only. Secrets stay in env / secret stores. Remote deployments must use HTTPS for OAuth callbacks.

---

## 10. Error Model

All tools return a predictable envelope:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable explanation.",
    "retryable": false
  }
}
```

| Code | Category | Typical cause |
|---|---|---|
| `AUTHENTICATION_REQUIRED` | Auth | Missing/expired Google auth |
| `INVALID_EMAIL` | Input | Bad recipient format |
| `DOCUMENT_NOT_FOUND` | Resource | Unknown Doc ID |
| `PERMISSION_DENIED` | Authorization | Account lacks Doc/Gmail permission |
| `GOOGLE_API_ERROR` | Upstream | Google API failure (`retryable` may be true) |
| `VALIDATION_ERROR` | Input | Schema / length / required field failures |
| `NETWORK_ERROR` | Transport | Connectivity issues (often retryable) |

Distinguish user/input, auth, authz, not-found, Google API, network, retryable vs non-retryable.

---

## 11. Validation Rules

### Email tools

- At least one `to` recipient
- Valid email format for `to` / `cc` / `bcc`
- `subject` and `body` present
- Enforce reasonable maximum lengths
- Do not silently modify or truncate content

### Docs tool

- `documentId` and `content` present
- Content within a reasonable size limit
- Do not silently truncate

Validation runs **before** any Google API call.

---

## 12. Security Architecture

| Control | Requirement |
|---|---|
| Secrets | Env vars / secrets manager; never committed |
| Tokens | Never log access tokens, refresh tokens, or client secrets |
| Scopes | Least privilege (compose, send, documents only) |
| Responses | Never return credentials in MCP payloads |
| Inputs | Validate all tool parameters |
| Logs | Redact / avoid full email bodies unless debug explicitly enabled |
| Transport | HTTPS for remote OAuth and deployments |

The server holds Google account access; treat every log line and response as a potential leak surface.

---

## 13. Idempotency (Send Email)

Agents may retry on timeouts, network failures, or reasoning loops. A timeout does **not** prove the email was not sent.

**V1 approach**

- Prefer supporting optional `idempotencyKey` on `gmail_send_email` if practical.
- Store recent key → result mappings (in-memory or durable file) with TTL.
- On duplicate key: return the prior success result instead of sending again.

If not implemented in V1, document as a required near-term enhancement and keep the tool interface ready for the optional field.

---

## 14. Observability

Structured logs per request:

```json
{
  "timestamp": "...",
  "level": "INFO",
  "tool": "gmail_send_email",
  "requestId": "...",
  "durationMs": 342,
  "success": true
}
```

Log tool start/complete/fail. Never log tokens, client secrets, or unnecessary PII.

---

## 15. Testing Strategy

```text
Unit tests (no Google credentials)
  ├── validation
  ├── MIME / Base64URL
  ├── schema enforcement
  ├── error mapping
  └── Docs append request construction

Integration tests (isolated)
  └── MCP client → MCP server → mocked or optional live Google APIs
```

- Domain services are mockable/injectable.
- Standard CI suite must not require real Google credentials.
- Live Google tests are opt-in and separated from unit tests.

---

## 16. Extensibility Model

Adding a new Workspace capability should follow:

```text
1. Define schema + types
2. Add domain service method (or new service)
3. Add thin tool handler
4. Register in toolRegistry
5. Add unit tests + docs
```

Layering (`Tools → Services → Google clients`) keeps new products (Sheets, Calendar, etc.) from growing a monolithic server file.

---

## 17. Implementation Phases

| Phase | Focus | Exit criteria |
|---|---|---|
| 1 — Project setup | TS/Node, MCP SDK, structure, lint, `.env.example`, logging | Project builds and runs empty shell |
| 2 — MCP server | Init, registry, discovery | Client can connect and list tools |
| 3 — Google auth | OAuth, token persistence, errors | Authenticated Gmail + Docs clients |
| 4 — Gmail | Draft + send tools + tests | Both tools work end-to-end |
| 5 — Google Docs | Append tool + tests | Append preserves existing content |
| 6 — Hardening | Validation, errors, logs, retry/idempotency, security review | Stable error/log contracts |
| 7 — Documentation | README (setup, auth, tools, troubleshooting) | New developer can run locally |

---

## 18. Definition of Done (Architecture Checklist)

**MCP**

- [ ] Server starts; clients can connect
- [ ] Tools discoverable with correct schemas and LLM-friendly descriptions

**Gmail**

- [ ] Draft and send work; CC/BCC; plain text; validation; errors handled; secrets not logged

**Google Docs**

- [ ] Append at end; preserve content; invalid ID and permission errors handled

**Engineering**

- [ ] Unit tests + mockable services
- [ ] Standardized errors and structured logs
- [ ] Env-based config; no secrets in repo
- [ ] Complete README

**Generic design**

- [ ] No agent-specific coupling
- [ ] Clear path to add more Workspace tools

---

## 19. Key Design Principles

1. **Generic MCP surface** — usable by any MCP client; no hard-coded agent assumptions.
2. **Separation of concerns** — tools thin; services own Google specifics; auth isolated.
3. **Explicit side effects** — draft ≠ send; destructive actions clearly described.
4. **Fail predictably** — validated inputs, canonical error codes, structured responses.
5. **Secure by default** — minimal scopes, no secret logging, env-based credentials.
6. **Small V1** — three reliable tools over a broad incomplete surface.
7. **Extend later** — consistent naming and layered architecture for future Workspace APIs.

---

## 20. Related Documents

- [Problem Statement](./problemStatement.md) — full product requirements, schemas, and examples
- [Deployment Plan](./deployment-plan.md) — Railway HTTP deploy plan
- [Railway deploy](./railway-deploy.md) — operational Railway runbook
- [README](../README.md) — setup, OAuth, running locally, connecting agents
