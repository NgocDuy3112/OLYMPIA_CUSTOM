import { drizzleTemplateRepo, type TemplateRepo } from "./template.repo.js";

interface TemplateConfig {
  type: "individual";
  playersPerMatch?: number;
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
  phaseId?: string;
  scheduledAt?: string;
  venue?: string;
  createdBy?: string;
}

interface TemplateServiceDeps {
  repo?: TemplateRepo;
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
  deps: { repo?: TemplateRepo } = {},
): Promise<{
  phases: PhaseData[];
  matches: MatchData[];
  totalMatches: number;
}> {
  const repo = deps.repo ?? drizzleTemplateRepo;
  // Get tournament
  const tournament = await repo.findTournamentByCode(tournamentCode);

  if (!tournament) {
    throw new Error("Tournament not found");
  }

  const tournamentId = tournament.id;
  const createdMatches: MatchData[] = [];
  const createdPhases: PhaseData[] = [];
  // label -> match id, used to resolve advancementRules into bracket_edges
  const labelToId = new Map<string, string>();

  // Process each phase — persist phase row FIRST so matches link via phase_id
  for (let phaseIndex = 0; phaseIndex < templateConfig.phases.length; phaseIndex++) {
    const phase = templateConfig.phases[phaseIndex];

    const phaseRow = await repo.insertPhase({
      tournamentId,
      phaseNumber: phaseIndex + 1,
      phaseName: phase.name,
      phaseType: phase.type,
      matchCount: 0,
    });
    const phaseId = phaseRow.id;

    let matchCount = 0;

    if (phase.type === "group_stage" && phase.rounds) {
      // Group stage: create matches for each round
      // Assume 4 players per match by default
      // We'll create placeholder matches - actual players assigned later
      // For now, create matches based on expected player count
      matchCount = phase.rounds * 4; // Assume 4 matches per round (16 players)

      for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
        const roundNumber = Math.floor(matchIndex / 4) + 1;
        const matchInRound = (matchIndex % 4) + 1;
        const matchLabel = generateMatchLabel(phaseIndex, matchIndex);

        const matchData = await createMatch(repo, {
          tournamentId,
          phaseId,
          matchName: `${phase.name} - Round ${roundNumber} - Match ${matchInRound}`,
          matchLabel,
          matchFormat: templateConfig.type,
          createdBy,
        });

        createdMatches.push(matchData);
      }
    } else if (phase.type === "playoffs" && phase.matches) {
      // Playoffs: create specified number of matches
      matchCount = phase.matches;

      for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
        const matchLabel = generateMatchLabel(phaseIndex, matchIndex);
        const matchData = await createMatch(repo, {
          tournamentId,
          phaseId,
          matchName: `${phase.name} - Match ${matchIndex + 1}`,
          matchLabel,
          matchFormat: templateConfig.type,
          createdBy,
        });

        createdMatches.push(matchData);
      }
    } else if (phase.type === "finale" && phase.matches) {
      // Finale: create final matches
      matchCount = phase.matches;

      for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
        const matchLabel = generateMatchLabel(phaseIndex, matchIndex);
        const matchData = await createMatch(repo, {
          tournamentId,
          phaseId,
          matchName: `${phase.name}${matchCount > 1 ? ` - Match ${matchIndex + 1}` : ""}`,
          matchLabel,
          matchFormat: templateConfig.type,
          createdBy,
        });

        createdMatches.push(matchData);
      }
    }

    await repo.updatePhaseMatchCount(phaseId, matchCount);

    createdPhases.push({
      id: phaseId,
      phaseNumber: phaseIndex + 1,
      phaseName: phase.name,
      phaseType: phase.type,
      matchCount,
    });
  }

  // Persist advancement rules as bracket edges (label -> id resolution)
  if (templateConfig.advancementRules?.length) {
    for (const m of createdMatches) {
      const found = await repo.findMatchByCode(m.matchCode);
      if (found) labelToId.set(m.matchLabel, found.id);
    }

    for (const rule of templateConfig.advancementRules) {
      const fromId = labelToId.get(rule.from);
      const toId = labelToId.get(rule.to);
      if (!fromId || !toId) continue;
      await repo.insertBracketEdge({
        fromMatchId: fromId,
        rank: rule.rank,
        toMatchId: toId,
      });
    }
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
async function createMatch(
  repo: TemplateRepo,
  params: {
    tournamentId: string;
    phaseId?: string;
    matchName: string;
    matchLabel: string;
    matchFormat: string;
    scheduledAt?: Date;
    venue?: string;
    createdBy?: string;
  },
): Promise<MatchData> {
  const matchCode = generateMatchCode(Math.random() * 10000);
  const matchPin = generatePin();

  const result = await repo.insertMatch({
    matchCode,
    matchPin,
    matchName: params.matchName,
    matchLabel: params.matchLabel,
    matchFormat: params.matchFormat,
    phaseId: params.phaseId,
    scheduledAt: params.scheduledAt,
    venue: params.venue,
    tournamentId: params.tournamentId,
    createdBy: params.createdBy,
  });

  return {
    matchCode: result.matchCode,
    matchSlug: result.matchSlug,
    matchPin: result.matchPin,
    matchName: result.matchName,
    matchLabel: result.matchLabel || params.matchLabel,
    matchFormat: result.matchFormat,
    tournamentId: params.tournamentId,
    phaseId: result.phaseId ?? params.phaseId,
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
  deps: TemplateServiceDeps = {},
): Promise<{
  phase: PhaseData;
  matches: MatchData[];
}> {
  const repo = deps.repo ?? drizzleTemplateRepo;
  // Get tournament
  const tournament = await repo.findTournamentByCode(tournamentCode);

  if (!tournament) {
    throw new Error("Tournament not found");
  }

  const tournamentId = tournament.id;

  // Get current matches in this phase
  const currentMatches = await repo.listMatchesByTournament(tournamentId);

  // Calculate next phase
  const nextPhaseNumber = currentPhaseNumber + 1;
  const nextPhaseMatchCount = Math.ceil(currentMatches.length / 2);

  const phaseRow = await repo.insertPhase({
    tournamentId,
    phaseNumber: nextPhaseNumber,
    phaseName: `Phase ${nextPhaseNumber}`,
    phaseType: "playoffs",
    matchCount: nextPhaseMatchCount,
  });
  const nextPhaseId = phaseRow.id;

  const createdMatches: MatchData[] = [];

  for (let i = 0; i < nextPhaseMatchCount; i++) {
    const matchData = await createMatch(repo, {
      tournamentId,
      phaseId: nextPhaseId,
      matchName: `Phase ${nextPhaseNumber} - Match ${i + 1}`,
      matchLabel: generateMatchLabel(nextPhaseNumber - 1, i),
      matchFormat: "individual",
    });

    createdMatches.push(matchData);
  }

  return {
    phase: {
      id: nextPhaseId,
      phaseNumber: nextPhaseNumber,
      phaseName: `Phase ${nextPhaseNumber}`,
      phaseType: "playoffs",
      matchCount: nextPhaseMatchCount,
    },
    matches: createdMatches,
  };
}
