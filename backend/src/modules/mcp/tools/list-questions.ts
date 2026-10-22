import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/server";
import { listForAgent } from "../../questions/service.js";
import { audit, mcpAuditDetails } from "../../audit/service.js";
import { actorFrom, requireScope } from "../actor.js";
import { assertTournamentVisible } from "../access.js";
import { runTool } from "../result.js";
import { requireTournament } from "../../tournaments/service.js";
import { toAgentQuestion } from "../map.js";

export const listQuestionsInput = z.object({
    tournamentId: z.uuid(),
    kind: z.enum(["MC", "TEXT", "KEYWORD"]).optional(),
    tag: z.string().max(64).optional(),
    search: z.string().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0)
});

export function registerListQuestions(server: McpServer): void {
    server.registerTool(
        "list_questions",
        {
            title: "List questions",
            description:
                "List questions visible to operators: PUBLISHED and ARCHIVED, tagged for the given tournament. Answers are included. `usable` is true only for PUBLISHED questions.",
            inputSchema: listQuestionsInput,
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
        },
        async (args, ctx) =>
            runTool(async () => {
                const actor = actorFrom(ctx.http?.authInfo);
                requireScope(actor, "READ");
                await assertTournamentVisible(args.tournamentId, actor.role);
                const tournament = await requireTournament(args.tournamentId);

                const page = await listForAgent(
                    tournament.tags,
                    { kind: args.kind, tag: args.tag, search: args.search },
                    { limit: args.limit, offset: args.offset }
                );

                await audit({
                    action: "mcp_tool_call",
                    actorId: actor.userId,
                    details: mcpAuditDetails(actor.keyId, {
                        tool: "list_questions",
                        tournamentId: args.tournamentId,
                        filters: { kind: args.kind, tag: args.tag, search: args.search },
                        total: page.total
                    })
                });

                return { ...page, items: page.items.map(toAgentQuestion) };
            })
    );
}