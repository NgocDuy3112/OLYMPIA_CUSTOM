Plan: Sửa lỗi map sai mã câu hỏi phần Về đích
Context
Mã câu VeDich có format: OC3_Q_VD_TTTK_20 (hoặc biến thể VDC/VDR: OC3_Q_VDC_TTTK_20)

Phần TTTK = viết tắt chủ đề (TTTK = Toán Tin Thống Kê)
Phần 20 = điểm số trực tiếp (20 / 30 / 40 / 50)
Nguyên nhân gốc rễ: Sau khi sort chữ cái (localeCompare), các viết tắt chủ đề xếp theo thứ tự:

KTTH, KTXH, TTTK, TNSS, VHNT, VHTT
(K…) (K…) (T…) (T…) (V…) (V…)
Nhưng mảng CATEGORIES hiện tại có thứ tự:

index 0: TOÁN - TIN - THỐNG KÊ       → TTTK
index 1: TỰ NHIÊN - SỰ SỐNG           → TNSS
index 2: KINH TẾ - XÃ HỘI            → KTXH
index 3: VĂN HỌC - NGHỆ THUẬT        → VHNT
index 4: VĂN HÓA - THỂ THAO          → VHTT
index 5: KIẾN THỨC TỔNG HỢP          → KTTH
⇒ Sau sort chữ cái: câu KTTH (KIẾN THỨC, catIdx=5) rơi vào questions[0] → được gán CATEGORIES[0] = TOÁN. Toàn bộ 6 chủ đề bị map sai.

Giải pháp
1. Tạo utility frontend/src/utils/veDichGrid.ts
Định nghĩa mapping viết tắt → catIdx, parser mã câu, và sort comparator:

export const VEDICH_CATEGORIES = [
  "TOÁN - TIN - THỐNG KÊ",    // 0 ← TTTK
  "TỰ NHIÊN - SỰ SỐNG",        // 1 ← TNSS
  "KINH TẾ - XÃ HỘI",         // 2 ← KTXH
  "VĂN HỌC - NGHỆ THUẬT",     // 3 ← VHNT
  "VĂN HÓA - THỂ THAO",       // 4 ← VHTT
  "KIẾN THỨC TỔNG HỢP",       // 5 ← KTTH
];

export const VEDICH_POINTS = [20, 30, 40, 50];

// Mapping viết tắt → catIdx (theo thứ tự lĩnh vực thực tế)
const ABBREV_TO_CAT_IDX: Record<string, number> = {
  TTTK: 0,  // Toán - Tin - Thống Kê
  TNSS: 1,  // Tự Nhiên - Sự Sống
  XHPL: 2,  // Xã Hội - Pháp Luật
  NTNV: 3,  // Nghệ Thuật - Ngôn Văn
  VHTT: 4,  // Văn Hóa - Thể Thao
  KTTH: 5,  // Kiến Thức Tổng Hợp
};

/**
 * Parse OC3_Q_VD[C|R]?_{ABBREV}_{POINTS} → {catIdx, tierIdx}
 *
 * Hỗ trợ cả: OC3_Q_VD_TTTK_20 và OC3_Q_VDC_TTTK_20
 */
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

/** Sort: (catIdx, tierIdx) nếu parse được; fallback numeric localeCompare */
export function compareVeDichCodes(a: string, b: string): number {
  const pa = parseVeDichCode(a);
  const pb = parseVeDichCode(b);
  if (pa && pb) {
    if (pa.catIdx !== pb.catIdx) return pa.catIdx - pb.catIdx;
    return pa.tierIdx - pb.tierIdx;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Lấy category label và điểm từ questionCode (fallback positional cho mã không parse được) */
export function getVeDichMeta(
  code: string,
  fallbackIdx: number,
): { category: string; points: number } {
  const parsed = parseVeDichCode(code);
  if (parsed) {
    return {
      category: VEDICH_CATEGORIES[parsed.catIdx] ?? `Category ${parsed.catIdx + 1}`,
      points: parsed.points,
    };
  }
  return {
    category: VEDICH_CATEGORIES[Math.floor(fallbackIdx / 4)] ?? `Category ${Math.floor(fallbackIdx / 4) + 1}`,
    points: VEDICH_POINTS[fallbackIdx % 4] ?? 0,
  };
}
2. Sửa AVeDichPickQuestionPage.tsx
File: frontend/src/pages/admin/AVeDichPickQuestionPage.tsx

Xóa const CATEGORIES = [...] cục bộ (dòng 28-35)
Import { compareVeDichCodes, getVeDichMeta } từ @/utils/veDichGrid
Dòng 65-73 — thay questionCategories / questionPoints:
const questionCategories = questions.map((q, idx) => getVeDichMeta(q.questionCode, idx).category);
const questionPoints     = questions.map((q, idx) => getVeDichMeta(q.questionCode, idx).points);
Dòng 276 — thay sort:
mapped.sort((a, b) => compareVeDichCodes(a.questionCode, b.questionCode));
3. Sửa AVeDichChungPage.tsx
File: frontend/src/pages/admin/AVeDichChungPage.tsx

Xóa const CATEGORIES = [...] cục bộ (dòng 39-46)
Import utilities
Dòng 247 — thay sort → compareVeDichCodes
Dòng 249-256 — thay cats/pts:
const cats = mapped.map((q, idx) => getVeDichMeta(q.questionCode, idx).category);
const pts  = mapped.map((q, idx) => getVeDichMeta(q.questionCode, idx).points);
4. Sửa AVeDichRiengPage.tsx
File: frontend/src/pages/admin/AVeDichRiengPage.tsx

Xóa const CATEGORIES = [...] cục bộ (dòng 43-50)
Import utilities
Dòng 283 — thay sort → compareVeDichCodes
Dòng 285-292 — thay cats/pts (cùng pattern)
5. PVeDichPickPage.tsx — không cần sửa sort
Player page nhận all_question_codes từ WS (admin đã sort đúng). Mapping positional Math.floor(idx/4) và idx%4 trong player page sẽ đúng sau khi admin gửi codes theo thứ tự (catIdx, tierIdx).

Files cần thay đổi
File	Thay đổi
frontend/src/utils/veDichGrid.ts	Tạo mới — parser, sort, mapping
frontend/src/pages/admin/AVeDichPickQuestionPage.tsx	Xóa CATEGORIES local, dùng utility
frontend/src/pages/admin/AVeDichChungPage.tsx	Xóa CATEGORIES local, dùng utility
frontend/src/pages/admin/AVeDichRiengPage.tsx	Xóa CATEGORIES local, dùng utility
Mapping viết tắt chủ đề (đã xác nhận)
Viết tắt	catIdx	Category label
TTTK	0	TOÁN - TIN - THỐNG KÊ
TNSS	1	TỰ NHIÊN - SỰ SỐNG
XHPL	2	KINH TẾ - XÃ HỘI
NTNV	3	VĂN HỌC - NGHỆ THUẬT
VHTT	4	VĂN HÓA - THỂ THAO
KTTH	5	KIẾN THỨC TỔNG HỢP
Sau alphabetical sort hiện tại: KTTH < NTNV < TNSS < TTTK < VHTT < XHPL — toàn bộ 5/6 chủ đề bị map sai.

Verification
Import Excel với mã như OC3_Q_VD_TTTK_20, OC3_Q_VD_KTXH_30, v.v.
Trang Pick Câu hỏi: ô TOÁN-20đ hiển thị đúng câu hỏi TTTK-20
Click ô KINH TẾ-30đ → câu KTXH-30 được kích hoạt
Thí sinh và MC nhận đúng category name và điểm qua WebSocket