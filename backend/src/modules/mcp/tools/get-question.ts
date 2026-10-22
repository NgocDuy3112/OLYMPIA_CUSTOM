import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/server";
import { getForAgent } from "../../questions/service.js";
import { audit, mcpAuditDetails } from "../../audit/service.js";
import { actorFrom, requireScope } from "../actor.js";
import { assertSeasonVisible } from "../access.js";
import { runTool } from "../result.js";
import { requireSeason } from "../../seasons/service.js";
import { toAgentQuestion } from "../map.js";

export const getQuestionInput = z.object({
    questionId: z.uuid(),
    seasonId: z.uuid()
});

export function registerGetQuestion(server: McpServer): void {
    server.registerTool(
        "get_question",
        {
            title: "Get question",
            description:
                "Fetch one question visible to operators (PUBLISHED or ARCHIVED, tagged for the given season). Answers are included.",
            inputSchema: getQuestionInput,
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
        },
        async (args, ctx) =>
            runTool(async () => {
                const actor = actorFrom(ctx.http?.authInfo);
                requireScope(actor, "READ");
                await assertSeasonVisible(args.seasonId, actor.role);
                const season = await requireSeason(args.seasonId);

                const row = await getForAgent(season.tags, args.questionId);

                await audit({
                    action: "mcp_tool_call",
                    actorId: actor.userId,
                    details: mcpAuditDetails(actor.keyId, {
                        tool: "get_question",
                        questionId: args.questionId,
                        seasonId: args.seasonId,
                        status: row.status
                    })
                });

                return toAgentQuestion(row);
            })
    );
}