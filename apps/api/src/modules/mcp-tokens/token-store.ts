import { existsSync, promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";


export interface McpTokenEntry {
  name: string;
  token: string;
  userCode: string;
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
        !!e &&
        typeof (e as McpTokenEntry).token === "string" &&
        typeof (e as McpTokenEntry).userCode === "string",
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
