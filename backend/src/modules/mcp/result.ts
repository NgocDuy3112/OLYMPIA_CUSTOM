import type { CallToolResult } from "@modelcontextprotocol/server";
import { QuestionError } from "../questions/errors.js";
import { McpKeyError } from "../mcp-keys/errors.js";


export class ToolError extends Error {
    constructor(public code: string, message: string) {
        super(message);
        this.name = "ToolError";
    }
}


export async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
    try {
        const data = await fn();
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch (error) {
        if (
            error instanceof ToolError ||
            error instanceof QuestionError ||
            error instanceof McpKeyError
        ) {
            return {
                content: [
                    { type: "text", text: JSON.stringify({ error: error.code, message: error.message }) }
                ],
                isError: true
            };
        }

        console.error("MCP tool failed", error);
        return {
            content: [
                { type: "text", text: JSON.stringify({ error: "INTERNAL", message: "Tool execution failed" }) }
            ],
            isError: true
        };
    }
}