import Fastify from "fastify";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { getMcpEnv, readFileTokens } from "./env.js";

async function runStdio(): Promise<void> {
  const env = getMcpEnv();
  // Giới hạn scope theo MCP_AGENT_NAME khi có cấu hình.
  const entry = env.agentTokens.find((t) => t.name === env.agentName);
  const allow = env.agentName ? (entry?.scopes ?? new Set<string>()) : null;
  const server = createMcpServer({ allow });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp] stdio ready");
}

/** Resolve scope từ Bearer. null = full access (dev mở hoặc service token).
 * Gộp env tokens + file tokens (admin cấp qua UI, hiệu lực ngay). */
async function resolveHttpScope(
  env: ReturnType<typeof getMcpEnv>,
  authorization: string | undefined,
): Promise<Set<string> | null | undefined> {
  const token = (authorization ?? "").startsWith("Bearer ")
    ? authorization!.slice(7)
    : "";
  const all = [...env.agentTokens, ...(await readFileTokens())];
  if (all.length > 0 || env.mcpServiceToken) {
    // Strict mode: bắt buộc token hợp lệ.
    const entry = all.find((t) => t.token === token);
    if (entry) return entry.scopes;
    if (env.mcpServiceToken && token === env.mcpServiceToken) return null;
    return undefined;
  }
  return null;
}

async function runHttp(): Promise<void> {
  const env = getMcpEnv();
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "healthy", service: "mcp" }));

  // Stateless mode: mỗi POST /mcp là 1 session độc lập, khỏi lưu session store.
  app.post("/mcp", async (request, reply) => {
    const allow = await resolveHttpScope(env, request.headers.authorization);
    if (allow === undefined) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const server = createMcpServer({ allow });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  app.get("/mcp", async (_req, reply) =>
    reply.code(405).send({ error: "Use POST /mcp for MCP requests" }),
  );

  await app.listen({ port: env.mcpPort, host: env.mcpHost });
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const wantHttp = args.has("--http") || args.has("--both");
  const wantStdio = args.has("--stdio") || args.has("--both") || !wantHttp;
  if (wantHttp && wantStdio) {
    // Chạy HTTP nền + stdio foreground.
    void runHttp().catch((err) => {
      console.error("[mcp] http failed:", err);
      process.exit(1);
    });
    await runStdio();
  } else if (wantHttp) {
    await runHttp();
  } else {
    await runStdio();
  }
}

void main().catch((err) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
