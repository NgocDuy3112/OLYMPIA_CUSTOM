export interface BankUsage {
  matchCode: string;
  questionCode: string;
  isUsed: boolean;
}

export interface BankData {
  bank_id: string;
  bank_code: string;
  content: string;
  answer: string;
  explanation: string | null;
  media_url: string | null;
  options?: string | null;
  tags?: string | null;
  round_hint?: string | null;
  usedCount: number;
  usedIn: BankUsage[];
}

export interface BankApiResponse {
  status: "success" | "error";
  message: string;
  data: unknown;
}

export const BANK_PAGE_SIZE = 20;

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
    tags: (row.tags as string | null) ?? null,
    round_hint:
      (row.roundHint as string | null) ?? (row.round_hint as string | null) ?? null,
    usedCount: Number(row.usedCount ?? row.used_count ?? rawUsed.length ?? 0),
    usedIn: rawUsed.map((u) => ({
      matchCode: String(u.matchCode ?? u.match_code ?? ""),
      questionCode: String(u.questionCode ?? u.question_code ?? ""),
      isUsed: Boolean(u.isUsed ?? u.is_used ?? false),
    })),
  };
}
