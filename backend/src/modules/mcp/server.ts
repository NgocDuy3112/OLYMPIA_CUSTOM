import { McpServer } from "@modelcontextprotocol/server";
import { registerListQuestions } from "./tools/list-questions.js";
import { registerGetQuestion } from "./tools/get-question.js";
import { registerEligibleQuestions } from "./tools/eligible-questions.js";


export function buildMcpServer(): McpServer {
    const server = new McpServer({ name: "olympia-custom", version: "0.1.0" });

    registerListQuestions(server);
    registerGetQuestion(server);
    registerEligibleQuestions(server);

    return server;
}