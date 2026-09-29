import { existsSync, promises as fs, watch } from "node:fs";

export interface McpEnv {
  apiBaseUrl: string;
  /** Session `sid` dev fallback — chỉ dùng khi không có token identity (dev mở / stdio không MCP_AGENT_NAME). */
  apiSid: string;
  /** Secret chung MCP→API: mint sid từ userCode (POST /api/auth/service/session). */
  mcpServiceToken: string;
  /** Per-agent tokens. Rỗng = dev mở. */
  agentTokens: AgentToken[];
  /** stdio mode: chọn entry trong MCP_AGENT_TOKENS theo tên. Rỗng = fallback OC_API_SID. */
  agentName: string;
  mcpPort: number;
  mcpHost: string;
}

/**
 * Token gắn identity: `name` chỉ để quản lý, `userCode` = user thật trong DB
 * (role operator/admin check lúc mint). Client chỉ thấy `token` opaque.
 */
export interface AgentToken {
  name: string;
  token: string;
  userCode: string;
}

/**
 * Format: "name:token:userCode;..." vd "ocee:tok1:OC_U_17270001".
 * Sai format (sai số phần) → bỏ qua entry.
 * Token cũ format role/scopes không đọc được → cấp lại qua UI.
 */
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

/** Tokens admin cấp qua UI (file share cùng image). Đọc mỗi request. */
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
    // Bỏ qua — env tokens vẫn chạy.
  }
}
