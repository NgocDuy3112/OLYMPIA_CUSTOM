#!/usr/bin/env node
import http from "node:http";
import { mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const PORT = process.env.LOG_SERVER_PORT
  ? Number(process.env.LOG_SERVER_PORT)
  : 4001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOG_DIR = resolve(__dirname, "../logs");
const LOG_FILE = resolve(LOG_DIR, "frontend.log");

mkdirSync(LOG_DIR, { recursive: true });

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/__logs") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        const line =
          JSON.stringify({ receivedAt: new Date().toISOString(), ...payload }) +
          "\n";
        appendFileSync(LOG_FILE, line, { encoding: "utf8" });
        res.writeHead(204);
        res.end();
      } catch (e) {
        res.writeHead(400);
        res.end("invalid payload");
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.info(`Log server listening on http://localhost:${PORT}/__logs`);
  console.info(`Writing frontend logs to: ${LOG_FILE}`);
});
