import { startBot } from "./bot.js";
import { startDiscordMcp, startDiscordMcpHttp } from "./mcp/server.js";

async function main(): Promise<void> {
  const client = await startBot();
  // Mặc định cả 2 (dev). Container truyền --http, local STDIO spawn truyền --stdio.
  const args = new Set(process.argv.slice(2));
  const wantHttp = args.has("--http") || args.has("--both") || !args.has("--stdio");
  const wantStdio = args.has("--stdio") || args.has("--both") || !args.has("--http");
  if (wantHttp) await startDiscordMcpHttp(client);
  if (wantStdio) await startDiscordMcp(client);
}

main().catch((err) => {
  console.error("Bot failed to start:", err);
  process.exit(1);
});
