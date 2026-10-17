import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.env.MCP_URL ?? "http://127.0.0.1:3000/mcp";
const token = process.env.MCP_TOKEN;
const tournamentId = process.env.MCP_TOURNAMENT_ID;

if (!token) {
    console.error("MCP_TOKEN is required (an ocmcp_... operator key)");
    process.exit(1);
}

const client = new Client({ name: "olympia-smoke", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(url), {
    authProvider: { token: async () => token }
});

await client.connect(transport);
console.log("connected:", client.getServerVersion());

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

if (tournamentId) {
    const result = await client.callTool({
        name: "list_questions",
        arguments: { tournamentId, limit: 5 }
    });
    const text = result.content?.[0];
    if (result.isError) {
        console.error("tool error:", text && text.type === "text" ? text.text : result.content);
    } else {
        const data = JSON.parse(text && text.type === "text" ? text.text : "{}");
        console.log(`total=${data.total}`);
        for (const q of data.items) {
            console.log(`  [${q.status}${q.usable ? "" : " · retired"}] ${q.questionText}`);
        }
    }
}

await transport.terminateSession();
await client.close();