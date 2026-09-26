/** Template slot bộ đề (đồng bộ backend slots.ts). */

export type SetRound = "KD_C" | "KD_R" | "GM" | "BP" | "VD";

export const SET_ROUND_TABS: { id: SetRound; label: string }[] = [
  { id: "KD_C", label: "KĐ chung" },
  { id: "KD_R", label: "KĐ riêng" },
  { id: "GM", label: "Giải mã" },
  { id: "BP", label: "Bứt phá" },
  { id: "VD", label: "Về đích" },
];

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

/** Nhóm dòng hiển thị: KĐ riêng theo lượt, VĐ theo lĩnh vực. */
export function slotGroups(round: SetRound): { label: string; slots: string[] }[] {
  const all = slotsForRound(round);
  if (round === "KD_R") {
    return [1, 2, 3, 4].map((t) => ({
      label: `Lượt ${t}`,
      slots: all.filter((s) => s.startsWith(`KDR${t}_`)),
    }));
  }
  if (round === "VD") {
    return VD_DOMAINS.map((d) => ({
      label: d,
      slots: all.filter((s) => s.startsWith(`VD_${d}_`)),
    }));
  }
  return [{ label: "", slots: all }];
}

/** round_hint tương ứng để lọc bank. */
export function bankRoundHint(round: SetRound): string {
  if (round === "KD_C") return "KD_C";
  if (round === "KD_R") return "KD_R";
  return round;
}
