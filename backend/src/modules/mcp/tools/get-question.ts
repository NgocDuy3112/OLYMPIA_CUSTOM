import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/server";
import { getForAgent } from "../../questions/service.js";
import { audit, mcpAuditDetails } from "../../audit/service.js";
import { actorFrom, requireScope } from "../actor.js";
import { assertTournamentVisible } from "../access.js";
import { runTool } from "../result.js";
import { requireTournament } from "../../tournaments/service.js";
import { toAgentQuestion } from "../map.js";

export const getQuestionInput = z.object({
    questionId: z.uuid(),
    tournamentId: z.uuid()
});

export function registerGetQuestion(server: McpServer): void {
    server.registerTool(
        "get_question",
        {
            title: "Get question",
            description:
                "Fetch one question visible to operators (PUBLISHED or ARCHIVED, tagged for the given tournament). Answers are included.",
            inputSchema: getQuestionInput,
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
        },
        async (args, ctx) =>
            runTool(async () => {
                const actor = actorFrom(ctx.http?.authInfo);
                requireScope(actor, "READ");
                await assertTournamentVisible(args.tournamentId, actor.role);
                const tournament = await requireTournament(args.tournamentId);

                const row = await getForAgent(tournament.tags, args.questionId);

                await audit({
                    action: "mcp_tool_call",
                    actorId: actor.userId,
                    details: mcpAuditDetails(actor.keyId, {
                        tool: "get_question",
                        questionId: args.questionId,
                        tournamentId: args.tournamentId,
                        status: row.status
                    })
                });

                return toAgentQuestion(row);
            })
    );
}