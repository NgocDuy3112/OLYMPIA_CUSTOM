/**
 * Nguồn duy nhất cho tên giai đoạn trận đấu.
 * Trước đây có 3 bản copy (HeaderBar, GameHeader, SLiveMatchPage) lệch nhau.
 */
export const PHASE_NAMES: Record<string, string> = {
  waiting: "Sảnh Chờ",
  kdc: "Khởi Động Chung",
  kdr: "Khởi Động Cá Nhân",
  bp: "Bứt Phá",
  vdc: "Về Đích Chung",
  vdr: "Về Đích Cá Nhân",
  gm: "Giải Mã",
  vl: "Vòng Loại",
};

/** Ưu tiên tên server gửi xuống, fallback sang bản dịch theo phase code. */
export const phaseLabel = (
  phase?: string | null,
  phaseName?: string | null,
): string | null => phaseName || (phase ? (PHASE_NAMES[phase] ?? phase) : null);
