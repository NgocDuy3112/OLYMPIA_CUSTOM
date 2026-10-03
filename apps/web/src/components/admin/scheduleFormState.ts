
export interface TournamentFormValue {
  tournamentName: string;
  description: string;
  tournamentFormat: string;
  startDate: string;
  endDate: string;
  maxPlayers: string;
  venue: string;
  notes: string;
  status: string;
}

export const emptyTournamentForm = (): TournamentFormValue => ({
  tournamentName: "",
  description: "",
  tournamentFormat: "oc3",
  startDate: "",
  endDate: "",
  maxPlayers: "",
  venue: "",
  notes: "",
  status: "draft",
});

export interface ScheduleFormValue {
  matchName: string;
  tournamentCode: string;
  scheduledAt: string;
  venue: string;
  matchLabel: string;
  phaseId: string;
  playerCodes: string[];
}

export const emptyScheduleForm = (): ScheduleFormValue => ({
  matchName: "",
  tournamentCode: "",
  scheduledAt: "",
  venue: "",
  matchLabel: "",
  phaseId: "",
  playerCodes: ["", "", "", ""],
});
