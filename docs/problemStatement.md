# Problem Statement — Generic Gmail & Google Docs MCP Server

## 1. Overview

Build a **generic Model Context Protocol (MCP) server** that enables AI agents to interact with **Gmail** and **Google Docs** through a standardized, secure, and reusable interface.

The MCP server should initially support two core capabilities:

1. **Send and draft emails using Gmail**
2. **Append content to Google Docs**

The server must be designed as a **generic MCP integration layer**, not as an implementation specific to a single AI agent. Any MCP-compatible AI agent should be able to discover and use these capabilities.

The initial implementation should prioritize:

- Simple tool interfaces
- Secure Google OAuth authentication
- Clear input/output schemas
- Safe handling of destructive or externally visible actions
- Extensibility for additional Google Workspace capabilities in the future
- Good error handling and observability

---

# 2. Goals

## Primary Goals

### Goal 1 — Gmail Integration

Allow an AI agent to:

- Draft an email
- Send an email
- Specify recipient(s)
- Specify CC/BCC
- Specify subject
- Specify email body
- Support plain-text email initially
- Return a structured result indicating success/failure

### Goal 2 — Google Docs Integration

Allow an AI agent to:

- Identify a Google Doc
- Append content to the end of the document
- Preserve existing document content
- Return a structured result indicating success/failure
- Provide enough metadata for the agent to understand what happened

### Goal 3 — Generic MCP Interface

The MCP server must:

- Follow the MCP specification
- Expose functionality through MCP tools
- Have well-defined JSON schemas
- Be usable by multiple AI agents
- Avoid hard-coding logic specific to one AI agent
- Keep Google-specific implementation details behind the MCP interface

---

# 3. Non-Goals — Initial Version

The following capabilities are **out of scope for V1** unless explicitly added later:

### Gmail

- Reading/searching emails
- Deleting emails
- Moving emails between folders
- Managing labels
- Managing attachments
- Email scheduling
- Email threads
- Email templates
- Calendar integration

### Google Docs

- Creating new documents
- Reading documents
- Editing arbitrary sections of a document
- Searching/replacing content
- Formatting existing document content
- Adding images
- Adding tables
- Managing document permissions

These can be considered future extensions.

---

# 4. High-Level Architecture

The proposed architecture:

```text
                    ┌──────────────────────┐
                    │      AI Agent        │
                    │                      │
                    │  Any MCP-compatible  │
                    │       Agent          │
                    └──────────┬───────────┘
                               │
                               │ MCP
                               ▼
                    ┌──────────────────────┐
                    │      MCP Server      │
                    │                      │
                    │  Tool Discovery      │
                    │  Validation          │
                    │  Authentication      │
                    │  Error Handling      │
                    └──────────┬───────────┘
                               │
                  ┌────────────┴────────────┐
                  │                         │
                  ▼                         ▼
          ┌───────────────┐         ┌────────────────┐
          │ Gmail Service │         │ Google Docs    │
          │               │         │ Service        │
          └───────┬───────┘         └────────┬───────┘
                  │                          │
                  ▼                          ▼
          ┌───────────────┐         ┌────────────────┐
          │ Gmail API     │         │ Google Docs API│
          └───────────────┘         └────────────────┘
```

The MCP layer should be independent from the AI agent.

The AI agent should only need to understand the MCP tools and their schemas.

---

# 5. MCP Tools

The server should expose the following tools.

---

## Tool 1 — `gmail_draft_email`

### Purpose

Create a draft email in the authenticated user's Gmail account.

The email should **not be sent**.

### Input

```json
{
  "to": ["recipient@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Email subject",
  "body": "Email body"
}
```

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "to": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "email"
      },
      "minItems": 1,
      "description": "Primary email recipients."
    },
    "cc": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "email"
      },
      "description": "CC recipients."
    },
    "bcc": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "email"
      },
      "description": "BCC recipients."
    },
    "subject": {
      "type": "string",
      "description": "Email subject."
    },
    "body": {
      "type": "string",
      "description": "Plain-text email body."
    }
  },
  "required": [
    "to",
    "subject",
    "body"
  ]
}
```

### Expected Behavior

1. Validate input.
2. Validate email addresses.
3. Construct a Gmail-compatible MIME message.
4. Encode the message as required by Gmail API.
5. Create a Gmail draft using the Gmail API.
6. Return the Gmail draft identifier.

### Example Response

```json
{
  "success": true,
  "draftId": "1234567890",
  "message": "Email draft created successfully."
}
```

---

# 6. Tool 2 — `gmail_send_email`

### Purpose

Send an email using the authenticated Gmail account.

This is an externally visible/destructive action and should be treated differently from drafting.

### Input

```json
{
  "to": ["recipient@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Email subject",
  "body": "Email body"
}
```

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "to": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "email"
      },
      "minItems": 1
    },
    "cc": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "email"
      }
    },
    "bcc": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "email"
      }
    },
    "subject": {
      "type": "string"
    },
    "body": {
      "type": "string"
    }
  },
  "required": [
    "to",
    "subject",
    "body"
  ]
}
```

### Expected Behavior

1. Validate input.
2. Construct MIME message.
3. Base64URL encode the message.
4. Call Gmail `messages.send`.
5. Return the Gmail message ID and thread ID where available.

### Example Response

```json
{
  "success": true,
  "messageId": "18c123456789",
  "threadId": "18c123456789",
  "message": "Email sent successfully."
}
```

### Safety Requirement

Sending an email has an external side effect.

The MCP server should make the distinction between:

```text
gmail_draft_email
```

and

```text
gmail_send_email
```

explicit.

The AI agent should never accidentally interpret a draft operation as a send operation.

The tool description should clearly state:

> This action sends an email to external recipients and cannot be automatically undone.

---

# 7. Tool 3 — `google_docs_append_content`

### Purpose

Append text to the end of an existing Google Doc.

### Input

```json
{
  "documentId": "1AbCdEfGhIjKlMnOp",
  "content": "This is the content to append."
}
```

### Input Schema

```json
{
  "type": "object",
  "properties": {
    "documentId": {
      "type": "string",
      "description": "Google Docs document ID."
    },
    "content": {
      "type": "string",
      "description": "Text to append to the end of the document."
    }
  },
  "required": [
    "documentId",
    "content"
  ]
}
```

### Expected Behavior

1. Validate the document ID.
2. Authenticate with Google.
3. Retrieve the document metadata/content using Google Docs API.
4. Determine the current end index.
5. Insert the supplied content at the end.
6. Preserve existing content.
7. Return a structured success response.

### Example Response

```json
{
  "success": true,
  "documentId": "1AbCdEfGhIjKlMnOp",
  "message": "Content appended successfully."
}
```

---

# 8. Authentication

The server should use **Google OAuth 2.0**.

The initial implementation should support authentication for:

- Gmail API
- Google Docs API

Required OAuth scopes should be kept as narrow as reasonably possible.

Potential scopes include:

```text
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/documents
```

Avoid requesting broad Google Workspace scopes when they are unnecessary.

---

# 9. Authentication Architecture

The authentication layer should be isolated from individual tools.

Recommended structure:

```text
src/
├── auth/
│   ├── googleAuth
│   ├── tokenManager
│   └── credentials
│
├── services/
│   ├── gmailService
│   └── googleDocsService
│
├── tools/
│   ├── gmailDraftEmail
│   ├── gmailSendEmail
│   └── googleDocsAppend
│
├── mcp/
│   ├── server
│   └── toolRegistry
│
├── utils/
│   ├── validation
│   ├── errors
│   └── logging
│
└── index
```

The exact language/framework can be selected based on the current MCP SDK ecosystem, but the architecture should maintain this separation of concerns.

---

# 10. Configuration

Configuration must not be hard-coded.

Use environment variables or a secure configuration mechanism.

Example:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_TOKEN_PATH=
LOG_LEVEL=info
```

Secrets must never be committed to source control.

Provide:

```text
.env.example
```

containing variable names but no real credentials.

---

# 11. Gmail Implementation Requirements

The Gmail service should encapsulate all Gmail API-specific logic.

The MCP tool should not directly contain Gmail API implementation details.

Example abstraction:

```typescript
interface GmailService {
  draftEmail(input: EmailInput): Promise<EmailDraftResult>;

  sendEmail(input: EmailInput): Promise<EmailSendResult>;
}
```

This allows the Gmail implementation to be changed without changing the MCP tool interface.

---

# 12. Google Docs Implementation Requirements

Similarly, Google Docs API logic should be encapsulated.

Example:

```typescript
interface GoogleDocsService {
  appendContent(
    documentId: string,
    content: string
  ): Promise<AppendContentResult>;
}
```

The MCP tool should call this abstraction rather than directly implementing Google Docs API operations.

---

# 13. Generic MCP Design

The MCP server must not contain assumptions such as:

```text
"This tool is only for Agent X"
```

or:

```text
"Only the user's personal AI assistant can use this."
```

Instead, it should expose capabilities generically.

For example:

```text
gmail_draft_email
gmail_send_email
google_docs_append_content
```

Any MCP-compatible client should be able to discover these tools.

Tool descriptions should be sufficiently detailed for an LLM to understand:

- What the tool does
- Required parameters
- Optional parameters
- Side effects
- Expected behavior
- When the tool should or should not be used

---

# 14. Tool Naming Convention

Use predictable names.

Recommended:

```text
gmail_draft_email
gmail_send_email
google_docs_append_content
```

Future capabilities could follow the same convention:

```text
gmail_search_emails
gmail_get_email
gmail_reply_email

google_docs_create
google_docs_read
google_docs_update
google_docs_insert
```

The naming convention should remain consistent.

---

# 15. Error Handling

All tools must return predictable errors.

Examples:

### Authentication Error

```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "Google authentication is required."
  }
}
```

### Invalid Email

```json
{
  "success": false,
  "error": {
    "code": "INVALID_EMAIL",
    "message": "One or more recipient email addresses are invalid."
  }
}
```

### Document Not Found

```json
{
  "success": false,
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "The requested Google Doc could not be found."
  }
}
```

### Permission Error

```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "The authenticated Google account does not have permission to access this document."
  }
}
```

### Google API Error

```json
{
  "success": false,
  "error": {
    "code": "GOOGLE_API_ERROR",
    "message": "Google API request failed.",
    "retryable": true
  }
}
```

Errors should distinguish between:

- User/input errors
- Authentication errors
- Authorization errors
- Resource-not-found errors
- Google API errors
- Network errors
- Retryable errors
- Non-retryable errors

---

# 16. Validation

Validate inputs before calling Google APIs.

### Email

Validate:

- At least one `to` recipient
- Valid email format
- Subject is present
- Body is present
- Reasonable maximum lengths

### Google Doc

Validate:

- `documentId` is present
- `content` is present
- Content is within a reasonable size limit

Do not silently modify or truncate user input.

---

# 17. Security Requirements

The MCP server will have access to a user's Google account and therefore must treat credentials as sensitive.

Requirements:

- Never log OAuth access tokens.
- Never log refresh tokens.
- Never log client secrets.
- Do not commit credentials.
- Use environment variables/secrets management.
- Use HTTPS for remote deployments.
- Minimize OAuth scopes.
- Validate all incoming tool parameters.
- Do not expose Google credentials through MCP responses.
- Sanitize logs.
- Avoid logging complete email bodies unless explicitly required for debugging.

---

# 18. Idempotency and Duplicate Actions

Special consideration is required for email sending.

AI agents can retry tool calls due to:

- Network failures
- Timeouts
- MCP client retries
- Agent reasoning loops

A timeout does **not necessarily mean that Gmail failed to send the email**.

Therefore, the implementation should consider an idempotency mechanism for `gmail_send_email`.

Possible approach:

```text
idempotencyKey
```

Optional input:

```json
{
  "to": ["user@example.com"],
  "subject": "Hello",
  "body": "Hello!",
  "idempotencyKey": "unique-operation-id"
}
```

If the same operation is retried with the same idempotency key, the server should avoid creating duplicate emails where possible.

This can be implemented in V1 if practical, otherwise document it as a required future enhancement.

---

# 19. Observability

The server should provide structured logs.

Example:

```text
INFO gmail_draft_email started
INFO gmail_draft_email completed
INFO google_docs_append_content started
ERROR gmail_send_email failed
```

Do not log sensitive information.

Recommended fields:

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

Every MCP request should ideally have a unique request/correlation ID.

---

# 20. Testing Requirements

The project should include automated tests.

## Unit Tests

Test:

- Email validation
- MIME message generation
- Base64URL encoding
- Tool input validation
- Error mapping
- Google Docs append request construction
- Authentication error handling

## Integration Tests

Where practical, test:

```text
AI Agent
   ↓
MCP Client
   ↓
MCP Server
   ↓
Google API
```

Google API integration tests should be isolated from unit tests.

Do not require real Google credentials for the standard test suite.

---

# 21. Mocking

Google APIs should be mockable.

Example:

```typescript
GmailService
GoogleDocsService
```

should be injectable into the MCP tools.

This allows tests such as:

```text
Given a valid email
When gmail_send_email is called
Then GmailService.sendEmail is called once
And the expected response is returned
```

---

# 22. README Requirements

Create a comprehensive `README.md`.

It should explain:

1. What the MCP server does
2. Architecture
3. Prerequisites
4. Google Cloud project setup
5. Enabling Gmail API
6. Enabling Google Docs API
7. OAuth credential setup
8. Environment configuration
9. Running locally
10. Connecting an MCP-compatible AI agent
11. Available tools
12. Example tool calls
13. Security considerations
14. Troubleshooting
15. Future extensions

---

# 23. Local Development

The project should support simple local setup.

Example:

```bash
git clone <repository>
cd <project>

npm install

cp .env.example .env

npm run dev
```

The actual commands may vary depending on the selected technology stack.

The implementation should document the exact commands in the README.

---

# 24. MCP Client Compatibility

The server should be designed so it can be connected to different MCP-compatible clients/agents.

For example:

```text
┌────────────────────┐
│ AI Agent A         │
└─────────┬──────────┘
          │
          │
┌─────────▼──────────┐
│                    │
│   Generic MCP      │
│      Server        │
│                    │
└─────────┬──────────┘
          │
     ┌────┴─────┐
     ▼          ▼
   Gmail       Docs
```

The server should not depend on a specific AI framework.

---

# 25. Extensibility

The implementation should make it straightforward to add future Google Workspace tools.

For example:

### Gmail

```text
gmail_search_emails
gmail_get_email
gmail_reply_email
gmail_forward_email
gmail_delete_email
```

### Google Docs

```text
google_docs_create
google_docs_read
google_docs_update
google_docs_search
```

### Google Sheets

```text
google_sheets_read
google_sheets_append
google_sheets_update
```

### Google Calendar

```text
google_calendar_create_event
google_calendar_update_event
google_calendar_delete_event
```

The architecture should therefore separate:

```text
MCP Tools
      ↓
Domain Services
      ↓
Google API Clients
```

rather than putting all functionality in a single MCP server file.

---

# 26. Suggested Project Structure

```text
google-workspace-mcp/
│
├── src/
│   ├── index.ts
│   │
│   ├── mcp/
│   │   ├── server.ts
│   │   └── toolRegistry.ts
│   │
│   ├── tools/
│   │   ├── gmail/
│   │   │   ├── draftEmail.ts
│   │   │   └── sendEmail.ts
│   │   │
│   │   └── googleDocs/
│   │       └── appendContent.ts
│   │
│   ├── services/
│   │   ├── gmailService.ts
│   │   └── googleDocsService.ts
│   │
│   ├── auth/
│   │   ├── googleAuth.ts
│   │   └── tokenManager.ts
│   │
│   ├── schemas/
│   │   ├── emailSchema.ts
│   │   └── googleDocsSchema.ts
│   │
│   ├── utils/
│   │   ├── errors.ts
│   │   ├── logger.ts
│   │   └── validation.ts
│   │
│   └── types/
│       └── index.ts
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

The exact structure may be adapted to the selected language/framework, but the separation of concerns should remain.

---

# 27. Technology Selection

Before implementation, evaluate the current MCP SDK and select a stable, well-supported technology stack.

Preferred characteristics:

- Strong MCP SDK support
- Strong Google API SDK support
- Good TypeScript/Node.js ecosystem
- Easy local development
- Good testing support
- Easy deployment
- Strong typing

**Preferred default:** TypeScript + Node.js unless there is a strong reason to use another language.

Use the official/current MCP SDK and official Google API libraries where possible.

Do not implement the MCP protocol manually if a maintained SDK is available.

---

# 28. Definition of Done

The project is considered complete when:

### MCP

- [ ] MCP server starts successfully.
- [ ] MCP client can connect to the server.
- [ ] Tools can be discovered.
- [ ] Tool schemas are correctly exposed.
- [ ] Tool descriptions are LLM-friendly.

### Gmail

- [ ] `gmail_draft_email` works.
- [ ] `gmail_send_email` works.
- [ ] Gmail authentication works.
- [ ] Recipient validation works.
- [ ] CC/BCC works.
- [ ] Plain-text email works.
- [ ] Gmail API errors are handled.
- [ ] Sensitive credentials are not logged.

### Google Docs

- [ ] `google_docs_append_content` works.
- [ ] Existing document content is preserved.
- [ ] Content is appended at the end.
- [ ] Invalid document IDs are handled.
- [ ] Permission errors are handled.
- [ ] Authentication works.

### Engineering

- [ ] Unit tests exist.
- [ ] Google API interactions can be mocked.
- [ ] Error handling is standardized.
- [ ] Logging is structured.
- [ ] Configuration is environment-based.
- [ ] No secrets are committed.
- [ ] README contains complete setup instructions.

### Generic Design

- [ ] No dependency on a specific AI agent.
- [ ] No hard-coded agent-specific behavior.
- [ ] Tools can be consumed by any MCP-compatible client.
- [ ] Architecture allows additional Google Workspace tools to be added later.

---

# 29. Example Agent Interaction

An AI agent might reason:

```text
User:
"Send an email to John saying that the meeting has been moved to 4 PM."

Agent:
1. Identify that an email needs to be sent.
2. Determine recipient.
3. Generate subject/body.
4. Call gmail_send_email.
5. Return the result to the user.
```

MCP call:

```json
{
  "name": "gmail_send_email",
  "arguments": {
    "to": ["john@example.com"],
    "subject": "Meeting Time Update",
    "body": "Hi John,\n\nThe meeting has been moved to 4 PM.\n\nThanks"
  }
}
```

Another example:

```text
User:
"Add today's meeting notes to our project Google Doc."

Agent:
1. Identify the document.
2. Prepare the meeting notes.
3. Call google_docs_append_content.
4. Confirm successful append.
```

MCP call:

```json
{
  "name": "google_docs_append_content",
  "arguments": {
    "documentId": "1AbCdEfGhIjKlMnOp",
    "content": "\n\nMeeting Notes — September 11, 2026\n\n- Discussed project timeline\n- Reviewed open issues\n- Agreed on next steps"
  }
}
```

---

# 30. Important Design Principle

The MCP server should be treated as a **capability layer for AI agents**.

The architecture should be:

```text
                    AI Agent
                       │
                       │
                       ▼
                Generic MCP API
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
      Gmail Tools              Docs Tools
          │                         │
          ▼                         ▼
      Gmail Service            Docs Service
          │                         │
          ▼                         ▼
      Gmail API               Google Docs API
```

The AI agent owns the **reasoning**.

The MCP server owns the **capabilities and integrations**.

Google APIs own the **actual execution**.

This separation should be maintained throughout the implementation.

---

# 31. Implementation Instruction for Cursor / Antigravity

Build this project incrementally.

### Phase 1 — Project Setup

- Initialize the project.
- Select and configure the MCP SDK.
- Configure TypeScript/Node.js.
- Create the project structure.
- Add linting and formatting.
- Add `.env.example`.
- Add basic logging.

### Phase 2 — MCP Server

- Implement MCP server initialization.
- Implement tool registration.
- Implement tool discovery.
- Verify the server can be connected to from an MCP client.

### Phase 3 — Google Authentication

- Implement Google OAuth.
- Implement token persistence securely.
- Implement authentication error handling.
- Verify Gmail and Docs scopes.

### Phase 4 — Gmail

Implement:

```text
gmail_draft_email
gmail_send_email
```

Add unit and integration tests.

### Phase 5 — Google Docs

Implement:

```text
google_docs_append_content
```

Add unit and integration tests.

### Phase 6 — Hardening

Add:

- Input validation
- Standardized errors
- Structured logging
- Retry handling where appropriate
- Idempotency consideration for email sending
- Security review

### Phase 7 — Documentation

Create a complete README explaining setup, authentication, tools, configuration, examples, and troubleshooting.

---

# 32. Final Requirement

Do not over-engineer the first version.

The V1 server should provide a **small, reliable, well-designed set of MCP tools**:

```text
gmail_draft_email
gmail_send_email
google_docs_append_content
```

The implementation should prioritize:

**Reliability > Security > Simplicity > Extensibility**

The resulting MCP server should be usable independently by multiple AI agents and should provide a clean foundation for adding additional Google Workspace capabilities in future versions.