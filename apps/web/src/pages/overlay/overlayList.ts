export const ROUND_KEYS = [
  "kdc",
  "kdr",
  "bp",
  "gm",
  "vdc",
  "vdr",
  "vdc-pick",
  "vdr-pick",
] as const;

export type RoundKey = (typeof ROUND_KEYS)[number];

export const ROUND_LABELS: Record<RoundKey, string> = {
  kdc: "Khởi động chung",
  kdr: "Khởi động riêng",
  bp: "Bứt phá",
  gm: "Giải mã",
  vdc: "Về đích chung",
  vdr: "Về đích riêng",
  "vdc-pick": "Về đích chung (chọn gói)",
  "vdr-pick": "Về đích riêng (chọn gói)",
};

export interface OverlayItem {
  id: string;
  name: string;
  description: string;
  path: string;
  defaultWidth: number;
  defaultHeight: number;
}

/** Danh mục overlay dùng chung: preview page + controller overview. */
export const OVERLAYS: OverlayItem[] = [
  {
    id: "player-bar",
    name: "Player Bar",
    description: "Hiển thị tên và điểm các thí sinh",
    path: "player-bar",
    defaultWidth: 700,
    defaultHeight: 80,
  },
  {
    id: "scoreboard",
    name: "Scoreboard",
    description: "Bảng xếp hạng theo thời gian thực",
    path: "scoreboard",
    defaultWidth: 320,
    defaultHeight: 400,
  },
  {
    id: "timer",
    name: "Timer",
    description: "Đồng hồ đếm giờ với vòng tròn tiến trình",
    path: "timer",
    defaultWidth: 140,
    defaultHeight: 140,
  },
  {
    id: "question",
    name: "Question",
    description: "Hiển thị câu hỏi hiện tại",
    path: "question",
    defaultWidth: 700,
    defaultHeight: 300,
  },
  ...ROUND_KEYS.map((key) => ({
    id: `round-${key}`,
    name: ROUND_LABELS[key],
    description: "Toàn cảnh vòng thi (tái dùng view MC)",
    path: `round/${key}`,
    defaultWidth: 1280,
    defaultHeight: 720,
  })),
];

export function overlayUrl(matchCode: string, path: string): string {
  return `${window.location.origin}/overlay/${encodeURIComponent(matchCode)}/${path}`;
}
