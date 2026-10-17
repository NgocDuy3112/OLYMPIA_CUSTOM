import type { AuthInfo } from "@modelcontextprotocol/server";
import { ToolError } from "./result.js";


export interface McpActor {
    keyId: string;
    scopes: string[];
    userId: string | null;
    role: string | null;
}


export function actorFrom(auth: AuthInfo | undefined): McpActor {
    if (!auth) throw new ToolError("UNAUTHORIZED", "Missing MCP authentication context");

    return {
        keyId: auth.clientId,
        scopes: auth.scopes ?? [],
        userId: (auth.extra?.userId as string | undefined) ?? null,
        role: (auth.extra?.role as string | undefined) ?? null
    };
}


export function requireScope(actor: McpActor, scope: string): void {
    if (!actor.scopes.includes(scope)) {
        throw new ToolError("FORBIDDEN", `Missing scope: ${scope}`);
    }
}