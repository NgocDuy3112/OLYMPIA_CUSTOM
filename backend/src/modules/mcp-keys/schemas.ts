import "../../lib/typebox-formats.js";
import { Type, Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { IsoDateTime, Uuid } from "../../game/contracts/index.js";
import { McpKeyError } from "./errors.js";

// Publishing and scoring are deliberately absent: no key can ever reach them.
export const McpScope = Type.Union([
    Type.Literal("READ"),
    Type.Literal("WRITE"),
    Type.Literal("ANNOUNCE")
]);
export type McpScopeValue = Static<typeof McpScope>;

export const CreateMcpKeyInput = Type.Object({
    label: Type.String({ minLength: 1, maxLength: 100 }),
    scopes: Type.Optional(Type.Array(McpScope, { minItems: 1 })),
    expiresAt: Type.Optional(Type.Union([IsoDateTime, Type.Null()]))
});
export type CreateMcpKeyInput = Static<typeof CreateMcpKeyInput>;

export const ListMcpKeysQuery = Type.Object({
    userId: Type.Optional(Uuid),
    limit: Type.Optional(Type.String({ pattern: "^\\d+$" })),
    offset: Type.Optional(Type.String({ pattern: "^\\d+$" }))
});
export type ListMcpKeysQuery = Static<typeof ListMcpKeysQuery>;

export function validate(schema: TSchema, value: unknown): void {
    if (!Value.Check(schema, value)) {
        const details = Array.from(Value.Errors(schema, value)).map(
            (e) => `${e.path || "<root>"}: ${e.message}`
        );
        throw new McpKeyError("VALIDATION", "MCP key payload failed validation", details);
    }
}
