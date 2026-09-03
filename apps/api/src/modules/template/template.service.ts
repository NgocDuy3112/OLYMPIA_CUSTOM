import { db, matches, tournaments } from "@oc/db";
import { eq, and, sql } from "drizzle-orm";

interface TemplateConfig {
  type: "individual" | "team";
  playersPerMatch?: number;
  playersPerTeam?: number;
  teamsPerMatch?: number;
  phases: Array<{
    name: string;
    type: "group_stage" | "playoffs" | "finale";
    rounds?: number;
    matches?: number;
    tiers?: string[];
    playerSource?: string;
  }>;
  tiers?: string[];
  advancementRules?: Array<{
    from: string;
    rank: number;
    to: string;
  }>;
}

interface PhaseData {
  id: string;
  phaseNumber: number;
  phaseName: string;
  phaseType: string;
  matchCount: number;
}

interface MatchData {
  matchCode: string;
  matchSlug: string;
  matchPin: string;
  matchName: string;
  matchLabel: string;
  matchFormat: string;
  tournamentId: string;
  createdBy?: string;
}

// Generate random 6-digit PIN
function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate match code
function generateMatchCode(index: number): string {
  return `OC3_M_${Date.now().toString(36).toUpperCase()}_${index}`;
}

// Generate match label (M01, M02, ...)
function generateMatchLabel(phaseIndex: number, matchIndex: number): string {
  const matchNum = phaseIndex * 100 + matchIndex + 1;
  return `M${String(matchNum).padStart(2, "0")}`;
}

/**
 * Apply a template to a tournament.
 * Generates phases, rounds, and matches based on template config.
 */
export async function applyTemplate(
  tournamentCode: string,
  templateConfig: TemplateConfig,
  createdBy?: string,
): Promise<{
  phases: PhaseData[];
  matches: MatchData[];
  totalMatches: number;
}> {
  // Get tournament
  const tournamentRows = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(
      and(
        eq(tournaments.tournamentCode, tournamentCode),
        eq(tournaments.isDeleted, false),
      ),
    )
    .limit(1);

  if (tournamentRows.length === 0) {
    throw new Error("Tournament not found");
  }

  const tournamentId = tournamentRows[0].id;
  const createdMatches: MatchData[] = [];
  const createdPhases: PhaseData[] = [];

  // Process each phase
  for (let phaseIndex = 0; phaseIndex < templateConfig.phases.length; phaseIndex++) {
    const phase = templateConfig.phases[phaseIndex];

    let matchCount = 0;

    if (phase.type === "group_stage" && phase.rounds) {
      // Group stage: create matches for each round
      // Assume 4 players per match by default
      const playersPerMatch = templateConfig.playersPerMatch || 4;

      // We'll create placeholder matches - actual players assigned later
      // For now, create matches based on expected player count
      matchCount = phase.rounds * 4; // Assume 4 matches per round (16 players)

      for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
        const roundNumber = Math.floor(matchIndex / 4) + 1;
        const matchInRound = (matchIndex % 4) + 1;

        const matchData = await createMatch({
          tournamentId,
          matchName: `${phase.name} - Round ${roundNumber} - Match ${matchInRound}`,
          matchLabel: generateMatchLabel(phaseIndex, matchIndex),
          matchFormat: templateConfig.type,
          createdBy,
        });

        createdMatches.push(matchData);
      }
    } else if (phase.type === "playoffs" && phase.matches) {
      // Playoffs: create specified number of matches
      matchCount = phase.matches;

      for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
        const matchData = await createMatch({
          tournamentId,
          matchName: `${phase.name} - Match ${matchIndex + 1}`,
          matchLabel: generateMatchLabel(phaseIndex, matchIndex),
          matchFormat: templateConfig.type,
          createdBy,
        });

        createdMatches.push(matchData);
      }
    } else if (phase.type === "finale" && phase.matches) {
      // Finale: create final matches
      matchCount = phase.matches;

      for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
        const matchData = await createMatch({
          tournamentId,
          matchName: `${phase.name}${matchCount > 1 ? ` - Match ${matchIndex + 1}` : ""}`,
          matchLabel: generateMatchLabel(phaseIndex, matchIndex),
          matchFormat: templateConfig.type,
          createdBy,
        });

        createdMatches.push(matchData);
      }
    }

    createdPhases.push({
      id: `phase_${phaseIndex + 1}`,
      phaseNumber: phaseIndex + 1,
      phaseName: phase.name,
      phaseType: phase.type,
      matchCount,
    });
  }

  return {
    phases: createdPhases,
    matches: createdMatches,
    totalMatches: createdMatches.length,
  };
}

/**
 * Create a single match with generated codes.
 */
async function createMatch(params: {
  tournamentId: string;
  matchName: string;
  matchLabel: string;
  matchFormat: string;
  createdBy?: string;
}): Promise<MatchData> {
  const matchCode = generateMatchCode(Math.random() * 10000);
  const matchPin = generatePin();

  const result = await db
    .insert(matches)
    .values({
      matchCode,
      matchPin,
      matchName: params.matchName,
      matchLabel: params.matchLabel,
      matchFormat: params.matchFormat,
      tournamentId: params.tournamentId,
      createdBy: params.createdBy,
    })
    .returning();

  return {
    matchCode: result[0].matchCode,
    matchSlug: result[0].matchSlug,
    matchPin: result[0].matchPin,
    matchName: result[0].matchName,
    matchLabel: result[0].matchLabel || params.matchLabel,
    matchFormat: result[0].matchFormat,
    tournamentId: params.tournamentId,
    createdBy: params.createdBy,
  };
}

/**
 * Generate next round matches based on current round results.
 * Used for auto-generating playoff rounds.
 */
export async function generateNextRound(
  tournamentCode: string,
  currentPhaseNumber: number,
): Promise<{
  phase: PhaseData;
  matches: MatchData[];
}> {
  // Get tournament
  const tournamentRows = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(
      and(
        eq(tournaments.tournamentCode, tournamentCode),
        eq(tournaments.isDeleted, false),
      ),
    )
    .limit(1);

  if (tournamentRows.length === 0) {
    throw new Error("Tournament not found");
  }

  const tournamentId = tournamentRows[0].id;

  // Get current matches in this phase
  const currentMatches = await db
    .select({ id: matches.id, matchLabel: matches.matchLabel })
    .from(matches)
    .where(
      and(
        eq(matches.tournamentId, tournamentId),
        eq(matches.isDeleted, false),
      ),
    );

  // Calculate next phase
  const nextPhaseNumber = currentPhaseNumber + 1;
  const nextPhaseMatchCount = Math.ceil(currentMatches.length / 2);

  const createdMatches: MatchData[] = [];

  for (let i = 0; i < nextPhaseMatchCount; i++) {
    const matchData = await createMatch({
      tournamentId,
      matchName: `Phase ${nextPhaseNumber} - Match ${i + 1}`,
      matchLabel: generateMatchLabel(nextPhaseNumber - 1, i),
      matchFormat: "individual",
    });

    createdMatches.push(matchData);
  }

  return {
    phase: {
      id: `phase_${nextPhaseNumber}`,
      phaseNumber: nextPhaseNumber,
      phaseName: `Phase ${nextPhaseNumber}`,
      phaseType: "playoffs",
      matchCount: nextPhaseMatchCount,
    },
    matches: createdMatches,
  };
}
