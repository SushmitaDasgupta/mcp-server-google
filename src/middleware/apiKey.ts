import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/**
 * Extract a shared secret from Authorization: Bearer or X-API-Key.
 */
export function extractApiKeyFromHeaders(
  authorization: string | string[] | undefined,
  xApiKey: string | string[] | undefined,
): string | null {
  const authHeader = Array.isArray(authorization)
    ? authorization[0]
    : authorization;
  if (authHeader) {
    const match = /^\s*Bearer\s+(.+)\s*$/i.exec(authHeader);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const keyHeader = Array.isArray(xApiKey) ? xApiKey[0] : xApiKey;
  if (keyHeader?.trim()) {
    return keyHeader.trim();
  }

  return null;
}

export function extractApiKeyFromNodeRequest(req: IncomingMessage): string | null {
  return extractApiKeyFromHeaders(req.headers.authorization, req.headers["x-api-key"]);
}

export function extractApiKeyFromRequest(request: Request): string | null {
  return extractApiKeyFromHeaders(
    request.headers.get("authorization") ?? undefined,
    request.headers.get("x-api-key") ?? undefined,
  );
}

function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Constant-time-ish length mismatch: still hash compare equal-length buffers.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function isValidApiKey(
  provided: string | null | undefined,
  expected: string,
): boolean {
  if (!provided || !expected) {
    return false;
  }
  return safeEqual(provided, expected);
}

/** Returns a 401 Response when the request is missing/invalid API key. */
export function unauthorizedApiKeyResponse(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="mcp", error="invalid_token"',
    },
  });
}

/**
 * Gate for web-standard handlers. Returns a 401 Response to send, or null if OK.
 */
export function requireApiKey(
  request: Request,
  expectedApiKey: string,
): Response | null {
  const provided = extractApiKeyFromRequest(request);
  if (!isValidApiKey(provided, expectedApiKey)) {
    return unauthorizedApiKeyResponse();
  }
  return null;
}
