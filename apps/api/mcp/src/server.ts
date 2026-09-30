import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";

export function createMcpServer(
  opts: { localFiles?: boolean } = {},
): McpServer {
  const server = new McpServer({
    name: "olympia-custom",
    version: "0.1.0",
  });
  registerTools(server, opts);
  return server;
}
