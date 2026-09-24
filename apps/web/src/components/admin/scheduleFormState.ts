/** State shape của form lên lịch (không chứa component). */

export interface ScheduleFormValue {
  matchName: string;
  tournamentCode: string;
  scheduledAt: string; // datetime-local "YYYY-MM-DDTHH:mm" hoặc rỗng
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
