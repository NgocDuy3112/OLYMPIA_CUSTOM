import { existsSync, promises as fs, watch } from "node:fs";

export interface McpEnv {
  apiBaseUrl: string;
  apiSid: string;
  mcpServiceToken: string;
  agentTokens: AgentToken[];
  agentName: string;
  mcpPort: number;
  mcpHost: string;
}

export interface AgentToken {
  name: string;
  token: string;
  userCode: string;
}

export function parseAgentTokens(raw: string): AgentToken[] {
  const out: AgentToken[] = [];
  for (const entry of raw.split(";")) {
    const parts = entry.split(":").map((s) => s.trim());
    if (parts.length !== 3) continue;
    const [name, token, userCode] = parts as [string, string, string];
    if (!name || !token || !userCode) continue;
    out.push({ name, token, userCode });
  }
  return out;
}

export function getMcpEnv(): McpEnv {
  return {
    apiBaseUrl: (process.env.OC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, ""),
    apiSid: process.env.OC_API_SID ?? "",
    mcpServiceToken: process.env.MCP_SERVICE_TOKEN ?? "",
    agentTokens: parseAgentTokens(process.env.MCP_AGENT_TOKENS ?? ""),
    agentName: process.env.MCP_AGENT_NAME ?? "",
    mcpPort: Number(process.env.MCP_PORT ?? 8300),
    mcpHost: process.env.MCP_HOST ?? "0.0.0.0",
  };
}

interface FileEntry {
  name?: unknown;
  token?: unknown;
  userCode?: unknown;
  revoked?: unknown;
}

function tokensFilePath(): string {
  return process.env.MCP_TOKENS_FILE ?? "/app/data/mcp-tokens.json";
}

export async function readFileTokens(): Promise<AgentToken[]> {
  try {
    if (!existsSync(tokensFilePath())) return [];
    const raw = JSON.parse(await fs.readFile(tokensFilePath(), "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    const out: AgentToken[] = [];
    for (const e of raw as FileEntry[]) {
      if (e.revoked) continue;
      const name = typeof e.name === "string" ? e.name : "";
      const token = typeof e.token === "string" ? e.token : "";
      const userCode = typeof e.userCode === "string" ? e.userCode : "";
      if (name && token && userCode) out.push({ name, token, userCode });
    }
    return out;
  } catch {
    return [];
  }
}

export function watchTokenFile(onChange: () => void): void {
  try {
    if (!existsSync(tokensFilePath())) return;
    watch(tokensFilePath(), () => onChange());
  } catch {
  }
}
