/**
 * Bank import — mapping input → bank fields. SỐNG 1 CHỖ cho mọi transport:
 *   - POST /bank/import { items }  : raw cells từ Excel (UI browser / MCP stdio parse)
 *   - POST /bank/import { rows }   : field-name rows (model paste trong chat)
 * Quy tắc: map theo TÊN cột (không vị trí), accent-insensitive; giá trị "None"
 * trong template = rỗng; media nhận URL http(s), tên file → warning (upload sau).
 */

import { BANK_VD_DOMAINS, BANK_VD_LEVELS } from "./constants.js";

export const BANK_CODE_RE = /^QB_[A-Z0-9_]{1,20}$/;
export const MAX_IMPORT_ROWS = 100;

const GM_HINTS = new Set(["KEY", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"]);
const EMPTY_TOKENS = new Set(["none", "null", "nil", "n/a", "#n/a", "-"]);

/** Đồng bộ với EditBankSidebar.genBankCode — ngày DDMMYYYY theo giờ VN. */
export function vnDate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("day")}${g("month")}${g("year")}`;
}

export interface BankFields {
  bankCode?: string;
  content?: string;
  answer?: string;
  explanation?: string;
  hintText?: string;
  mediaUrl?: string;
  options?: string[];
  roundHint?: string;
  domain?: string;
  difficulty?: number;
  setCode?: string;
  hintIndex?: string;
}

export interface RawItem {
  sheet?: string;
  row: number;
  cells: Record<string, unknown>;
}

export interface RowIssue {
  row: number;
  sheet?: string;
  field?: string;
  msg: string;
}

export interface MediaWarning {
  row: number;
  sheet?: string;
  file: string;
  note: string;
}

export interface NormalizedRow {
  row: number;
  sheet?: string;
  fields: BankFields;
  mediaWarning?: MediaWarning;
}

// ── Helpers ──────────────────────────────────────────────────────────

export function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function headerKey(s: string): string {
  return stripAccents(String(s)).toLowerCase().replace(/\s+/g, " ").trim();
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === "" || EMPTY_TOKENS.has(s.toLowerCase());
}

function cellString(v: unknown): string | undefined {
  if (isEmpty(v)) return undefined;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return o.richText
        .map((t) => String((t as Record<string, unknown>).text ?? ""))
        .join("")
        .trim();
    }
    if (o.result !== undefined) return String(o.result);
    if (typeof o.text === "string") return o.text.trim();
  }
  return String(v).trim();
}

// ── Alias cột (accent-insensitive) → field ───────────────────────────
// Key = headerKey(): "Câu hỏi" → "cau hoi".

type Target = keyof BankFields | "media";

const HEADER_MAP: Record<string, Target> = {
  // Tiếng Việt (template OC_BANK)
  "cau hoi": "content",
  "dap an": "answer",
  "dap an cau hoi": "answer",
  "giai thich": "explanation",
  "goi y": "hintText",
  "luot": "roundHint",
  "ma goi y": "hintIndex",
  "bo goi y": "setCode",
  "linh vuc": "domain",
  "muc diem": "difficulty",
  // Field-name (model paste / curl)
  bankcode: "bankCode",
  content: "content",
  answer: "answer",
  explanation: "explanation",
  hinttext: "hintText",
  mediaurl: "mediaUrl",
  options: "options",
  roundhint: "roundHint",
  domain: "domain",
  difficulty: "difficulty",
  setcode: "setCode",
  hintindex: "hintIndex",
};

/** Tên sheet → roundHint mặc định (cột Lượt/roundHint vẫn override). */
const SHEET_ROUND: Record<string, string> = {
  KHOI_DONG: "KD_C",
  GIAI_MA: "GM",
  BUT_PHA: "BP",
  VE_DICH: "VD",
};

/** Cột "Lượt" (KHOI_DONG): Chung → KD_C, Riêng → KD_R. */
const LUOT_MAP: Record<string, string> = {
  chung: "KD_C",
  rieng: "KD_R",
  kd_c: "KD_C",
  kd_r: "KD_R",
};

function resolveMedia(
  raw: string | undefined,
  row: number,
  sheet?: string,
): { url?: string; warning?: MediaWarning } {
  if (!raw) return {};
  if (/^https?:\/\//i.test(raw)) return { url: raw };
  return {
    warning: {
      row,
      sheet,
      file: raw,
      note: "Tên file (không phải URL) — upload media sau qua UI, mediaUrl bỏ trống",
    },
  };
}

function coerceOptions(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string" && v.includes("|")) {
    return v.split("|").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(v) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* fallthrough */
    }
  }
  return undefined;
}

// ── Normalize: raw cells (Excel) hoặc field-name rows → NormalizedRow ──

export function normalizeRows(items: RawItem[]): {
  rows: NormalizedRow[];
  issues: RowIssue[];
} {
  const rows: NormalizedRow[] = [];
  const issues: RowIssue[] = [];

  for (const item of items) {
    const sheetRound = item.sheet
      ? SHEET_ROUND[stripAccents(item.sheet).toUpperCase().replace(/[\s-]+/g, "_")]
      : undefined;
    const fields: BankFields = {};
    let luotRound: string | undefined;
    let mediaRaw: string | undefined;

    for (const [rawKey, rawVal] of Object.entries(item.cells ?? {})) {
      const key = headerKey(rawKey);
      // Cột media: map đúng tên template HOẶC bất kỳ cột nào bắt đầu "file"
      const target: Target | undefined =
        HEADER_MAP[key] ?? (key.startsWith("file") ? "media" : undefined);
      if (!target) continue; // cột lạ → bỏ qua (template freely extensible)
      if (target === "media") {
        mediaRaw = cellString(rawVal);
        continue;
      }
      if (key === "luot") {
        const v = cellString(rawVal);
        if (v) {
          const plain = stripAccents(v).toLowerCase();
          luotRound = LUOT_MAP[plain] ?? stripAccents(v).toUpperCase();
        }
        continue;
      }
      const s = cellString(rawVal);
      if (s === undefined) continue;
      if (target === "difficulty") {
        const n = Number(s);
        fields.difficulty = Number.isFinite(n) ? n : NaN;
      } else if (target === "options") {
        const opts = coerceOptions(rawVal);
        if (opts) fields.options = opts;
      } else {
        fields[target] = s;
      }
    }

    // Normalization cấp field
    if (fields.roundHint) fields.roundHint = fields.roundHint.toUpperCase();
    if (fields.domain) fields.domain = fields.domain.toUpperCase();
    if (fields.setCode) fields.setCode = fields.setCode.toUpperCase();
    if (fields.hintIndex) fields.hintIndex = fields.hintIndex.toUpperCase();
    if (fields.bankCode) fields.bankCode = fields.bankCode.toUpperCase();

    const round = luotRound ?? fields.roundHint ?? sheetRound;
    if (round) fields.roundHint = round;
    else if (item.sheet) {
      issues.push({
        row: item.row,
        sheet: item.sheet,
        msg: `Sheet "${item.sheet}" không nhận diện được và thiếu cột Vòng/Lượt`,
      });
      continue;
    }

    // mediaUrl: URL → lấy; tên file → warning; "None"/trống → bỏ
    const mediaSrc = mediaRaw ?? fields.mediaUrl;
    let mediaWarning: MediaWarning | undefined;
    fields.mediaUrl = undefined;
    if (mediaSrc !== undefined) {
      const m = resolveMedia(mediaSrc, item.row, item.sheet);
      if (m.warning) mediaWarning = m.warning;
      else fields.mediaUrl = m.url;
    }

    rows.push({
      row: item.row,
      sheet: item.sheet,
      fields,
      mediaWarning,
    });
  }
  return { rows, issues };
}

// ── Validate ─────────────────────────────────────────────────────────

export function validateRow(
  row: Pick<NormalizedRow, "row" | "sheet" | "fields">,
): RowIssue[] {
  const out: RowIssue[] = [];
  const at = { row: row.row, sheet: row.sheet };
  const f = row.fields;
  if (!f.content?.trim()) out.push({ ...at, field: "content", msg: "content bắt buộc" });
  if (!f.answer?.trim()) out.push({ ...at, field: "answer", msg: "answer bắt buộc" });
  if (f.bankCode !== undefined && !BANK_CODE_RE.test(f.bankCode)) {
    out.push({ ...at, field: "bankCode", msg: "bankCode phải khớp QB_[A-Z0-9_]{1,20}" });
  }
  if (f.domain !== undefined && !BANK_VD_DOMAINS.includes(f.domain)) {
    out.push({
      ...at,
      field: "domain",
      msg: `domain không hợp lệ (một trong ${BANK_VD_DOMAINS.join("/")})`,
    });
  }
  if (f.difficulty !== undefined && !BANK_VD_LEVELS.includes(f.difficulty)) {
    out.push({
      ...at,
      field: "difficulty",
      msg: `Mức điểm phải là một trong ${BANK_VD_LEVELS.join("/")}`,
    });
  }
  if (f.hintIndex !== undefined && !GM_HINTS.has(f.hintIndex)) {
    out.push({ ...at, field: "hintIndex", msg: "Mã gợi ý phải là KEY hoặc H1..H8" });
  }
  return out;
}

// ── Set GM (GIAI_MA) ─────────────────────────────────────────────

/** KEY + H1..H8 — ĐỒNG HỢP với GM_ORDER trong question-set.routes.ts
 *  (bên đó không export, không import chung được — đổi bên này nếu đổi bên kia). */
const GM_SET_REQUIRED = [
  "KEY",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "H7",
  "H8",
] as const;

/**
 * Gom set + validate cấp SET cho GM (hành vi riêng của sheet GIAI_MA):
 * - Mỗi setCode phải có ĐÚNG 1 KEY + đủ H1..H8 (pick-gm-set trả 422 nếu thiếu,
 *   `Map<hintIndex>` overwrite im lặng nếu trùng).
 * - Vi phạm set → issue cho TỪNG row của set → import chặn cả set (atomic),
 *   không để setHalf-broken lọt vào DB.
 */
export function validateGmSets(rows: NormalizedRow[]): RowIssue[] {
  const out: RowIssue[] = [];
  const gm = rows.filter((r) => r.fields.roundHint === "GM");
  if (gm.length === 0) return out;

  // Row-level: thiếu cột
  for (const r of gm.filter((r) => !r.fields.hintIndex)) {
    out.push({
      row: r.row,
      sheet: r.sheet,
      field: "hintIndex",
      msg: "GM cần cột Mã gợi ý (KEY hoặc H1..H8)",
    });
  }
  for (const r of gm.filter((r) => !r.fields.setCode)) {
    out.push({
      row: r.row,
      sheet: r.sheet,
      field: "setCode",
      msg: "GM cần cột Bộ gợi ý để gom set",
    });
  }

  // Set-level
  const bySet = new Map<string, NormalizedRow[]>();
  for (const r of gm) {
    if (!r.fields.setCode) continue;
    bySet.set(r.fields.setCode, [...(bySet.get(r.fields.setCode) ?? []), r]);
  }
  for (const [set, list] of bySet) {
    const problems: string[] = [];
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const r of list) {
      const h = r.fields.hintIndex;
      if (!h) continue;
      if (seen.has(h)) dup.add(h);
      seen.add(h);
    }
    if (dup.size > 0) problems.push(`trùng ${[...dup].join(",")}`);
    if (!seen.has("KEY")) problems.push("thiếu KEY");
    const missing = GM_SET_REQUIRED.filter((h) => !seen.has(h));
    if (missing.length > 0) problems.push(`thiếu ${missing.join(",")}`);

    if (problems.length > 0) {
      const msg = `set ${set}: ${problems.join("; ")} — pick-gm-set cần đủ KEY+H1..H8`;
      for (const r of list) {
        out.push({ row: r.row, sheet: r.sheet, field: "setCode", msg });
      }
    }
  }
  return out;
}

// ── Auto-gen bankCode: QB_<ROUND>_<DDMMYYYY>_<NN> ───────────────────

function roundToken(roundHint: string | undefined): string {
  const t = stripAccents(roundHint ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (t || "IM").slice(0, 10);
}

/** setCode tuần tự `S<n>` kế từ MAX hiện có — thay hashing
 *  `SET_<base36>` (web trước đây). Chỉ tính `S<digits>`, bỏ qua SET_ cũ. */
export function nextSequentialSetCode(existing: string[]): string {
  let max = 0;
  for (const code of existing) {
    const m = /^S(\d+)$/.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `S${max + 1}`;
}

/** Prefix `QB_<TOKEN>_<DDMMYYYY>_` cho các rows THIẾU bankCode —
 *  route dùng để query listCodesByPrefix trước khi assignAutoCodes. */
export function autoCodePrefixes(
  rows: NormalizedRow[],
  today: string = vnDate(),
): string[] {
  const tokens = new Set(
    rows.filter((r) => !r.fields.bankCode).map((r) => roundToken(r.fields.roundHint)),
  );
  return [...tokens].map((t) => `QB_${t}_${today}_`);
}

/**
 * Điền bankCode cho rows thiếu code. `existing` = mọi bankCode trùng prefix
 * (gọi bankRepo.listCodesByPrefix trước) — NN bắt đầu sau MAX hiện tại,
 * nhảy qua code đã dùng (trong batch + DB), cap9999.
 */
export function assignAutoCodes(
  rows: NormalizedRow[],
  existing: string[],
  today: string = vnDate(),
): void {
  const used = new Set(existing);
  const next = new Map<string, number>();
  for (const code of existing) {
    const m = code.match(/^QB_([A-Z0-9]+)_(\d{8})_(\d+)$/);
    if (!m || m[2] !== today) continue;
    const n = Number(m[3]);
    if (n >= (next.get(m[1]) ?? 0)) next.set(m[1], n + 1);
  }
  for (const r of rows) {
    if (r.fields.bankCode) continue;
    const token = roundToken(r.fields.roundHint);
    let nn = next.get(token) ?? 1;
    let code: string;
    do {
      code = `QB_${token}_${today}_${String(nn).padStart(2, "0")}`;
      nn += 1;
    } while (used.has(code) && nn <= 9999);
    next.set(token, nn);
    used.add(code);
    r.fields.bankCode = code;
  }
}
