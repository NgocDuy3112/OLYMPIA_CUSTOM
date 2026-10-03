
export type SetRound = "KD_C" | "KD_R" | "GM" | "BP" | "VD";

export const SET_ROUNDS: SetRound[] = ["KD_C", "KD_R", "GM", "BP", "VD"];

const VD_DOMAINS = ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"];
const VD_LEVELS = [20, 30, 40, 50];
const GM_HINTS = ["KEY", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"];

export function slotsForRound(round: SetRound): string[] {
  if (round === "KD_C") return [1, 2, 3, 4, 5, 6].map((i) => `KDC_${i}`);
  if (round === "BP") return [1, 2, 3, 4].map((i) => `BP_${i}`);
  if (round === "GM") return GM_HINTS.map((h) => (h === "KEY" ? "GM_KEY" : `GM_${h}`));
  if (round === "VD") {
    const out: string[] = [];
    for (const d of VD_DOMAINS) for (const l of VD_LEVELS) out.push(`VD_${d}_${l}`);
    return out;
  }
  const out: string[] = [];
  for (let t = 1; t <= 4; t++) for (let i = 1; i <= 6; i++) out.push(`KDR${t}_${i}`);
  return out;
}

export function expectedSlotCount(round: SetRound): number {
  return slotsForRound(round).length;
}

export function totalExpectedSlots(): number {
  return SET_ROUNDS.reduce((n, r) => n + expectedSlotCount(r), 0);
}

export function roundOfSlot(slot: string): SetRound | null {
  if (/^KDC_[1-6]$/.test(slot)) return "KD_C";
  if (/^KDR[1-4]_[1-6]$/.test(slot)) return "KD_R";
  if (/^GM_(KEY|H[1-8])$/.test(slot)) return "GM";
  if (/^BP_[1-4]$/.test(slot)) return "BP";
  if (/^VD_(THTH|TNSS|XHPL|VHNT|TTGT|KTTH)_(20|30|40|50)$/.test(slot)) return "VD";
  return null;
}

export function missingSlots(round: SetRound, filled: string[]): string[] {
  const have = new Set(filled);
  return slotsForRound(round).filter((s) => !have.has(s));
}
