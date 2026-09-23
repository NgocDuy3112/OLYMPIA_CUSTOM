export interface BankUsage {
  matchCode: string;
  questionCode: string;
  isUsed: boolean;
}

export interface Citation {
  source: string;
  url: string;
  accessedAt: string;
}

export interface BankData {
  bank_id: string;
  bank_code: string;
  content: string;
  answer: string;
  explanation: string | null;
  media_url: string | null;
  options?: string | null;
  round_hint?: string | null;
  domain?: string | null;
  difficulty?: number | null;
  set_code?: string | null;
  hint_index?: string | null;
  citations: Citation[];
  status: "pending" | "approved" | "rejected";
  usedCount: number;
  usedIn: BankUsage[];
}

export interface BankApiResponse {
  status: "success" | "error";
  message: string;
  data: unknown;
}

export const BANK_PAGE_SIZE = 20;

/** ISO date → DD/MM/YYYY (Asia/Ho_Chi_Minh). */
export function formatVnDate(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

export function toBankData(row: Record<string, unknown>): BankData {
  const rawUsed = Array.isArray(row.usedIn ?? row.used_in)
    ? (row.usedIn ?? row.used_in) as Record<string, unknown>[]
    : [];
  return {
    bank_id: String(row.id ?? row.bank_id ?? ""),
    bank_code: String(row.bankCode ?? row.bank_code ?? ""),
    content: String(row.content ?? ""),
    answer: String(row.answer ?? ""),
    explanation: (row.explanation as string | null) ?? null,
    media_url:
      (row.mediaUrl as string | null) ?? (row.media_url as string | null) ?? null,
    options: (row.options as string | null) ?? null,
    round_hint:
      (row.roundHint as string | null) ?? (row.round_hint as string | null) ?? null,
    domain: (row.domain as string | null) ?? null,
    difficulty: (row.difficulty as number | null) ?? null,
    set_code: (row.setCode as string | null) ?? (row.set_code as string | null) ?? null,
    hint_index: (row.hintIndex as string | null) ?? (row.hint_index as string | null) ?? null,
    citations: Array.isArray(row.citations)
      ? (row.citations as Record<string, unknown>[]).map((c) => ({
          source: String(c.source ?? ""),
          url: String(c.url ?? ""),
          accessedAt: String(c.accessedAt ?? c.accessed_at ?? ""),
        }))
      : [],
    status: (row.status as BankData["status"]) ?? "pending",
    usedCount: Number(row.usedCount ?? row.used_count ?? rawUsed.length ?? 0),
    usedIn: rawUsed.map((u) => ({
      matchCode: String(u.matchCode ?? u.match_code ?? ""),
      questionCode: String(u.questionCode ?? u.question_code ?? ""),
      isUsed: Boolean(u.isUsed ?? u.is_used ?? false),
    })),
  };
}
