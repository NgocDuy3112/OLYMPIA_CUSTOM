/**
 * Built-in tournament templates (JSON config, no DB table).
 * Replaces tournament_templates table — only OC3/OC4 supported.
 */

export interface TemplatePhase {
  name: string;
  type: "group_stage" | "playoffs" | "finale";
  rounds?: number;
  matches?: number;
  tiers?: string[];
  playerSource?: string;
}

export interface BuiltinTemplate {
  id: string;
  templateName: string;
  templateType: string;
  description: string;
  config: {
    type: "individual";
    playersPerMatch: number;
    phases: TemplatePhase[];
    tiers?: string[];
    hasLeaderboard?: boolean;
    advancementRules?: Array<{ from: string; rank: number; to: string }>;
  };
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: "oc3-classic",
    templateName: "OC3 Classic",
    templateType: "oc3",
    description: "Format clásico: 2 rounds individual + Leaderboard",
    config: {
      type: "individual",
      playersPerMatch: 4,
      phases: [{ name: "Group Stage", type: "group_stage", rounds: 2 }],
      hasLeaderboard: true,
      tiers: ["S", "A", "B", "C"],
    },
  },
  {
    id: "oc4-full",
    templateName: "OC4 Full",
    templateType: "oc4",
    description: "Group Stage + Playoffs + Grand Finale",
    config: {
      type: "individual",
      playersPerMatch: 4,
      phases: [
        {
          name: "Group Stage",
          type: "group_stage",
          rounds: 2,
          tiers: ["S", "A", "B", "C"],
        },
        {
          name: "Playoffs Phase 1",
          type: "playoffs",
          matches: 4,
          playerSource: "tiers",
        },
        {
          name: "Playoffs Phase 2",
          type: "playoffs",
          matches: 3,
          playerSource: "previous_phase",
        },
        {
          name: "Playoffs Phase 3",
          type: "playoffs",
          matches: 2,
          playerSource: "previous_phase",
        },
        {
          name: "Playoffs Phase 4",
          type: "playoffs",
          matches: 1,
          playerSource: "previous_phase",
        },
        { name: "Grand Finale", type: "finale", matches: 1 },
      ],
      hasLeaderboard: true,
      advancementRules: [
        { from: "M09", rank: 1, to: "M19" },
        { from: "M09", rank: 2, to: "M13" },
        { from: "M09", rank: 3, to: "M13" },
        { from: "M09", rank: 4, to: "M13" },
        { from: "M10", rank: 1, to: "M13" },
        { from: "M10", rank: 2, to: "M14" },
        { from: "M10", rank: 3, to: "M14" },
        { from: "M10", rank: 4, to: "M14" },
        { from: "M11", rank: 1, to: "M14" },
        { from: "M11", rank: 2, to: "M15" },
        { from: "M11", rank: 3, to: "M15" },
        { from: "M11", rank: 4, to: "M15" },
        { from: "M12", rank: 1, to: "M15" },
      ],
    },
  },
];

export function getBuiltinTemplate(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
