import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";

export function createMcpServer(opts: { allow?: Set<string> | null } = {}): McpServer {
  const server = new McpServer({
    name: "olympia-custom",
    version: "0.1.0",
  });
  registerTools(server, opts.allow ?? null);
  return server;
}
