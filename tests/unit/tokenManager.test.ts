import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TokenManager } from "../../src/auth/tokenManager.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function tempTokenPath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcp-tokens-"));
  tempDirs.push(dir);
  return path.join(dir, "token.json");
}

describe("TokenManager", () => {
  it("falls back to GOOGLE_TOKENS_JSON when file is missing", async () => {
    const tokenPath = await tempTokenPath();
    const manager = new TokenManager({
      tokenPath,
      envTokensJson: JSON.stringify({
        refresh_token: "json-refresh",
        access_token: "json-access",
        expiry_date: 123,
      }),
      persistToDisk: false,
    });

    await expect(manager.load()).resolves.toEqual({
      refresh_token: "json-refresh",
      access_token: "json-access",
      expiry_date: 123,
    });
  });

  it("falls back to env refresh token when file and tokens JSON are missing", async () => {
    const tokenPath = await tempTokenPath();
    const manager = new TokenManager({
      tokenPath,
      envRefreshToken: "env-refresh",
      persistToDisk: false,
    });

    await expect(manager.load()).resolves.toEqual({
      refresh_token: "env-refresh",
    });
  });

  it("prefers GOOGLE_TOKENS_JSON over GOOGLE_REFRESH_TOKEN", async () => {
    const tokenPath = await tempTokenPath();
    const manager = new TokenManager({
      tokenPath,
      envTokensJson: JSON.stringify({ refresh_token: "json-refresh" }),
      envRefreshToken: "env-refresh",
      persistToDisk: false,
    });

    await expect(manager.load()).resolves.toEqual({
      refresh_token: "json-refresh",
    });
  });

  it("ignores invalid GOOGLE_TOKENS_JSON and falls back to refresh token", async () => {
    const tokenPath = await tempTokenPath();
    const manager = new TokenManager({
      tokenPath,
      envTokensJson: "{not-json",
      envRefreshToken: "env-refresh",
      persistToDisk: false,
    });

    await expect(manager.load()).resolves.toEqual({
      refresh_token: "env-refresh",
    });
  });

  it("prefers file tokens over env when file has a refresh token", async () => {
    const tokenPath = await tempTokenPath();
    const manager = new TokenManager({
      tokenPath,
      envTokensJson: JSON.stringify({ refresh_token: "json-refresh" }),
      envRefreshToken: "env-refresh",
      persistToDisk: true,
    });
    await manager.save({ refresh_token: "file-refresh", access_token: "a" });

    const reloaded = new TokenManager({
      tokenPath,
      envTokensJson: JSON.stringify({ refresh_token: "json-refresh" }),
      envRefreshToken: "env-refresh",
      persistToDisk: true,
    });
    await expect(reloaded.load()).resolves.toMatchObject({
      refresh_token: "file-refresh",
    });
  });

  it("skips disk writes when persistToDisk is false", async () => {
    const tokenPath = await tempTokenPath();
    const manager = new TokenManager({
      tokenPath,
      envRefreshToken: "env-refresh",
      persistToDisk: false,
    });
    await manager.save({
      refresh_token: "env-refresh",
      access_token: "new-access",
    });

    await expect(readFile(tokenPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(manager.load()).resolves.toMatchObject({
      access_token: "new-access",
    });
  });
});
