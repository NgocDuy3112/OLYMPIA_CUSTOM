// The public read surface's I/O: a spectator sees a tournament, its schedule and its
// places without a session. PRIVATE and deleted tournaments are a 404 — the module's
// rule is the portal's: existence never leaks, so a private tournament is simply
// "not found", never "forbidden".
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { matchResults, tournaments } from "../../db/schema/index.js";
import type { ResultEntry } from "../../game/contracts/index.js";
import { scaleCoverage } from "../../game/engine/scoring/placement.js";
import { type Page, type PageResult } from "../../lib/pagination.js";
import { tournamentPlaces } from "../bracket/service.js";
import { listMatches } from "../matches/service.js";
import { getStandings, namesOf } from "../standings/service.js";
import { TournamentError } from "../tournaments/errors.js";
import {
    presentMatch,
    presentStanding,
    presentTournament,
    presentTournamentSummary
} from "./present.js";
import type { PublicMatch, PublicTournament, PublicTournamentSummary } from "./schemas.js";

type TournamentRow = typeof tournaments.$inferSelect;

// A public tournament, by the slug its URL carries. The slug has a unique index
// (migration 0016), so this is one row or none.
export async function requirePublicTournamentBySlug(slug: string): Promise<TournamentRow> {
    const [row] = await db
        .select()
        .from(tournaments)
        .where(and(
            eq(tournaments.slug, slug),
            eq(tournaments.visibility, "PUBLIC"),
            isNull(tournaments.deletedAt)
        ))
        .limit(1);

    if (!row) throw new TournamentError("NOT_FOUND", `tournament ${slug} not found`);
    return row;
}

// The identity view: the tournament, its places and its points coverage — the same
// three things the portal's single read returns.
export async function publicTournament(slug: string): Promise<PublicTournament> {
    const row = await requirePublicTournamentBySlug(slug);
    const places = await tournamentPlaces(row.id);
    return presentTournament(row, places, scaleCoverage(row.placementTiers, places));
}

// Every public tournament, small: enough to pick one, nothing to leak. A spectator
// surface does not page — a deployment has a handful of tournaments.
export async function listPublicTournaments(): Promise<PublicTournamentSummary[]> {
    const rows = await db
        .select()
        .from(tournaments)
        .where(and(
            eq(tournaments.visibility, "PUBLIC"),
            isNull(tournaments.deletedAt)
        ))
        .orderBy(asc(tournaments.createdAt));

    return rows.map(presentTournamentSummary);
}

// The schedule: the tournament's matches, staged and labelled, with the stored
// results embedded for the FINISHED ones. Names are resolved here — the app shows
// people, not uuids.
export async function publicSchedule(slug: string, page: Page): Promise<PageResult<PublicMatch>> {
    const tournament = await requirePublicTournamentBySlug(slug);
    const listed = await listMatches(tournament.id, {}, page);

    const finishedIds = listed.items
        .filter((row) => row.status === "FINISHED")
        .map((row) => row.id);

    const resultsByMatch = await resultEntriesOf(finishedIds);

    // Every seat and every result may name a user; the schedule shows all of them.
    const ids = new Set<string>();
    for (const row of listed.items) {
        for (const seat of row.players) {
            ids.add(seat.kind === "user" ? seat.userId : seat.teamId);
        }
    }
    for (const entries of resultsByMatch.values()) {
        for (const entry of entries) ids.add(entry.userId ?? entry.teamId!);
    }
    const names = await namesOf([...ids]);

    const stageTitles = new Map(tournament.stages.map((stage) => [stage.id, stage.title]));

    return {
        ...listed,
        items: listed.items.map((row) =>
            presentMatch(row, stageTitles, names, resultsByMatch.get(row.id))
        )
    };
}

// One query for the whole page — the stored results of the finished matches.
async function resultEntriesOf(matchIds: string[]): Promise<Map<string, ResultEntry[]>> {
    const byMatch = new Map<string, ResultEntry[]>();
    if (matchIds.length === 0) return byMatch;

    const rows = await db
        .select({ matchId: matchResults.matchId, results: matchResults.results })
        .from(matchResults)
        .where(inArray(matchResults.matchId, matchIds));

    for (const row of rows) byMatch.set(row.matchId, row.results);
    return byMatch;
}

// The standings: the places table, read back out of how far each player got.
export async function publicStandings(slug: string) {
    const tournament = await requirePublicTournamentBySlug(slug);
    return { rows: (await getStandings(tournament.id)).map(presentStanding) };
}
