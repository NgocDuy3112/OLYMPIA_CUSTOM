import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const base = process.env.MCP_SMOKE_URL ?? "http://localhost:8300";
const EXPECTED = [
  "match_overview",
  "tournament_overview",
  "match_questions",
  "match_answers",
  "bank_search",
  "grade_question",
  "bank_create",
];

function checkTools(tools: { name: string }[], leg: string): boolean {
  const names = tools.map((t) => t.name).sort();
  console.log(`[smoke:${leg}] tools (${names.length}): ${names.join(", ")}`);
  const missing = EXPECTED.filter((n) => !names.includes(n));
  if (missing.length) {
    console.error(`[smoke:${leg}] MISSING: ${missing.join(", ")}`);
    return false;
  }
  return true;
}

async function smokeHttp(): Promise<boolean> {
  const health = await fetch(`${base}/health`);
  const body = (await health.json()) as { status?: string; service?: string };
  console.log(`[smoke:http] /health → ${health.status} ${JSON.stringify(body)}`);
  if (!health.ok || body.status !== "healthy" || body.service !== "mcp") {
    console.error("[smoke:http] health check FAILED");
    return false;
  }

  const client = new Client({ name: "oc-smoke", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  await client.connect(transport);
  const { tools } = await client.listTools();
  const ok = checkTools(tools, "http");
  await client.close();
  return ok;
}

async function smokeStdio(): Promise<boolean> {
  const client = new Client({ name: "oc-smoke", version: "0.0.1" });
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    stderr: "ignore",
  });
  await client.connect(transport);
  const { tools } = await client.listTools();
  const ok = checkTools(tools, "stdio");
  await client.close();
  return ok;
}

async function main(): Promise<void> {
  let allOk = true;
  try {
    allOk = (await smokeHttp()) && allOk;
  } catch (err) {
    console.error("[smoke:http] ERROR:", err);
    allOk = false;
  }
  try {
    allOk = (await smokeStdio()) && allOk;
  } catch (err) {
    console.error("[smoke:stdio] ERROR:", err);
    allOk = false;
  }
  console.log(allOk ? "[smoke] PASS" : "[smoke] FAIL");
  process.exit(allOk ? 0 : 1);
}

void main();
