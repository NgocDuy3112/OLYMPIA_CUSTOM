import { existsSync, promises as fs, watch } from "node:fs";

export interface McpEnv {
  apiBaseUrl: string;
  /** Session cookie `sid` của user đã login vào Fastify backend. Dùng cho stdio mode. */
  apiSid: string;
  /** Bearer token full-access (legacy). Rỗng = không check (dev). */
  mcpServiceToken: string;
  /** Per-agent tokens. Rỗng = dev mở. */
  agentTokens: AgentToken[];
  /** stdio mode: chọn entry trong MCP_AGENT_TOKENS theo tên. Rỗng = full. */
  agentName: string;
  mcpPort: number;
  mcpHost: string;
}

export type AgentRole = "admin" | "operator" | "agent";

export interface AgentToken {
  name: string;
  token: string;
  role: AgentRole;
  scopes: Set<string>;
}

const ALLOWED_ROLES: ReadonlySet<string> = new Set(["admin", "operator", "agent"]);

/**
 * Format: "name:token:role:scopes;..." vd "ocee:tok1:agent:read,judge".
 * Legacy 3 phần "name:token:scopes" → role=agent.
 * Role ngoài admin/operator/agent bị loại (MCP chỉ phục vụ 3 đối tượng này).
 */
export function parseAgentTokens(raw: string): AgentToken[] {
  const out: AgentToken[] = [];
  for (const entry of raw.split(";")) {
    const parts = entry.split(":").map((s) => s.trim());
    let name: string;
    let token: string;
    let role = "agent";
    let scopePart: string;
    if (parts.length === 4) {
      [name, token, role, scopePart] = parts as [string, string, string, string];
    } else if (parts.length === 3) {
      [name, token, scopePart] = parts as [string, string, string];
    } else {
      continue;
    }
    if (!name || !token || !ALLOWED_ROLES.has(role)) continue;
    const scopes = new Set<string>();
    for (const s of scopePart.split(",")) {
      const scope = s.trim();
      if (scope === "*") {
        scopes.add("read").add("score").add("bank").add("judge");
      } else if (scope) {
        scopes.add(scope);
      }
    }
    out.push({ name, token, role: role as AgentRole, scopes });
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
  role?: unknown;
  scopes?: unknown;
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
      const role = typeof e.role === "string" ? e.role : "";
      const scopes = new Set<string>();
      if (Array.isArray(e.scopes)) {
        for (const s of e.scopes) {
          if (typeof s !== "string") continue;
          if (s === "*") scopes.add("read").add("score").add("bank").add("judge");
          else if (s) scopes.add(s);
        }
      }
      if (name && token && ALLOWED_ROLES.has(role) && scopes.size > 0) {
        out.push({ name, token, role: role as AgentRole, scopes });
      }
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
