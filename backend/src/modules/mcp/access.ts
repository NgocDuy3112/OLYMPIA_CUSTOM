import { canViewSeason } from "../../lib/season-access.js";
import { requireSeason } from "../seasons/service.js";
import { ToolError } from "./result.js";


export async function assertSeasonVisible(
    seasonId: string,
    role: string | null
): Promise<void> {
    const season = await requireSeason(seasonId);
    const user = { role } as unknown as Parameters<typeof canViewSeason>[1];
    if (!canViewSeason(season, user)) {
        throw new ToolError("NOT_FOUND", `season ${seasonId} not found`);
    }
}
