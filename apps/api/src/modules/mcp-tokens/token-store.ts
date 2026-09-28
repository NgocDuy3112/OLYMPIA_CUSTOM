import { existsSync, promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";

/**
 * MCP tokens file — backend (admin UI) ghi, MCP server watch + reload.
 * Cùng image api+mcp nên share filesystem, không cần restart.
 * Format: [{ name, token, role, scopes, createdBy, createdAt, revoked }]
 */

export interface McpTokenEntry {
  name: string;
  token: string;
  role: string;
  scopes: string[];
  createdBy: string | null;
  createdAt: string;
  revoked: boolean;
}

export function tokensFilePath(): string {
  return process.env.MCP_TOKENS_FILE ?? "/app/data/mcp-tokens.json";
}

export async function readTokenFile(): Promise<McpTokenEntry[]> {
  const path = tokensFilePath();
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(await fs.readFile(path, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is McpTokenEntry =>
        !!e && typeof (e as McpTokenEntry).token === "string",
    );
  } catch {
    return [];
  }
}

export async function writeTokenFile(entries: McpTokenEntry[]): Promise<void> {
  await fs.mkdir(tokensFilePath().split("/").slice(0, -1).join("/") || ".", {
    recursive: true,
  });
  await fs.writeFile(tokensFilePath(), JSON.stringify(entries, null, 2), {
    mode: 0o600,
  });
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}
