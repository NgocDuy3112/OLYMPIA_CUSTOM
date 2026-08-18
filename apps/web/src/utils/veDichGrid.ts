export const VEDICH_CATEGORIES = [
  "TOÁN - TIN - THỐNG KÊ",
  "TỰ NHIÊN - SỰ SỐNG",
  "KINH TẾ - XÃ HỘI",
  "VĂN HỌC - NGHỆ THUẬT",
  "VĂN HÓA - THỂ THAO",
  "KIẾN THỨC TỔNG HỢP",
];

export const VEDICH_POINTS = [20, 30, 40, 50];

const ABBREV_TO_CAT_IDX: Record<string, number> = {
  TTTK: 0,
  TNSS: 1,
  XHPL: 2,
  NTNV: 3,
  VHTT: 4,
  KTTH: 5,
};

export interface VeDichCodeInfo {
  catIdx: number;
  tierIdx: number;
  abbrev: string;
  points: number;
}

export function parseVeDichCode(code: string): VeDichCodeInfo | null {
  const m = code.match(/OC3_Q_VD[A-Z]*_([A-Z]+)_(\d+)$/i);
  if (!m) return null;
  const abbrev = m[1].toUpperCase();
  const points = parseInt(m[2], 10);
  const catIdx = ABBREV_TO_CAT_IDX[abbrev];
  const tierIdx = VEDICH_POINTS.indexOf(points);
  if (catIdx === undefined || tierIdx === -1) return null;
  return { catIdx, tierIdx, abbrev, points };
}

export function compareVeDichCodes(a: string, b: string): number {
  const pa = parseVeDichCode(a);
  const pb = parseVeDichCode(b);
  if (pa && pb) {
    if (pa.catIdx !== pb.catIdx) return pa.catIdx - pb.catIdx;
    return pa.tierIdx - pb.tierIdx;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function getVeDichMeta(
  code: string,
  fallbackIdx: number,
): { category: string; points: number } {
  const parsed = parseVeDichCode(code);
  if (parsed) {
    return {
      category:
        VEDICH_CATEGORIES[parsed.catIdx] ?? `Category ${parsed.catIdx + 1}`,
      points: parsed.points,
    };
  }
  return {
    category:
      VEDICH_CATEGORIES[Math.floor(fallbackIdx / 4)] ??
      `Category ${Math.floor(fallbackIdx / 4) + 1}`,
    points: VEDICH_POINTS[fallbackIdx % 4] ?? 0,
  };
}

export function generateVeDichPlaceholderCodes(): string[] {
  const codes: string[] = [];
  for (let catIdx = 0; catIdx < 6; catIdx++) {
    for (let tierIdx = 0; tierIdx < 4; tierIdx++) {
      const abbrev =
        Object.keys(ABBREV_TO_CAT_IDX).find(
          (key) => ABBREV_TO_CAT_IDX[key] === catIdx,
        ) || "KTTH";
      const points = VEDICH_POINTS[tierIdx];
      codes.push(`OC3_Q_VD_${abbrev}_${points}`);
    }
  }
  return codes;
}
