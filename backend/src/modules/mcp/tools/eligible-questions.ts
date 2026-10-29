import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/server";
import { listForAssembly } from "../../questions/service.js";
import type { QuestionKindValue } from "../../questions/payload.js";
import { audit, mcpAuditDetails } from "../../audit/service.js";
import { actorFrom, requireScope } from "../actor.js";
import { assertTournamentVisible } from "../access.js";
import { runTool } from "../result.js";
import { toAgentQuestion } from "../map.js";


export const eligibleQuestionsInput = z.object({
    tournamentId: z.uuid(),
    kind: z.enum(["MC", "TEXT", "KEYWORD", "HINT"]).optional(),
    search: z.string().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0)
});


export function registerEligibleQuestions(server: McpServer): void {
    server.registerTool(
        "eligible_questions",
        {
            title: "Eligible questions",
            description:
                "Browse the pool a match may draw from: the PUBLISHED questions (narrow with `kind`). Use this for assembly. Unlike list_questions, ARCHIVED is excluded.",
            inputSchema: eligibleQuestionsInput,
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
        },
        async (args, ctx) =>
            runTool(async () => {
                const actor = actorFrom(ctx.http?.authInfo);
                requireScope(actor, "READ");
                await assertTournamentVisible(args.tournamentId, actor.role);

                const page = await listForAssembly(
                    {
                        kinds: args.kind ? [args.kind as QuestionKindValue] : undefined,
                        search: args.search
                    },
                    { limit: args.limit, offset: args.offset }
                );

                await audit({
                    action: "mcp_tool_call",
                    actorId: actor.userId,
                    details: mcpAuditDetails(actor.keyId, {
                        tool: "eligible_questions",
                        tournamentId: args.tournamentId,
                        filters: { kind: args.kind, search: args.search },
                        total: page.total
                    })
                });

                return { ...page, items: page.items.map(toAgentQuestion) };
            })
    );
}