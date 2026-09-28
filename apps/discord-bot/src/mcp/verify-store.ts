import type Redis from "ioredis";

const PREFIX = "vf:";

export type VerifyStatus = "pending" | "yes" | "no" | "cancelled";

export interface VerifyRecord {
  id: string;
  question: string;
  context: string;
  channelId: string;
  messageId: string;
  status: VerifyStatus;
  verdictBy: string;
  decidedAt: string;
  reminds: number;
  lastRemind: string;
}

export function verifyKey(id: string): string {
  return `${PREFIX}${id}`;
}

export async function saveVerify(
  valkey: Redis,
  rec: VerifyRecord,
  ttlSec: number,
): Promise<void> {
  await valkey.hset(verifyKey(rec.id), {
    question: rec.question,
    context: rec.context,
    channelId: rec.channelId,
    messageId: rec.messageId,
    status: rec.status,
    verdictBy: rec.verdictBy,
    decidedAt: rec.decidedAt,
    reminds: String(rec.reminds),
    lastRemind: rec.lastRemind,
  });
  await valkey.expire(verifyKey(rec.id), ttlSec);
}

export async function loadVerify(
  valkey: Redis,
  id: string,
): Promise<VerifyRecord | null> {
  const h = await valkey.hgetall(verifyKey(id));
  if (!h || !h.question) return null;
  return {
    id,
    question: h.question ?? "",
    context: h.context ?? "",
    channelId: h.channelId ?? "",
    messageId: h.messageId ?? "",
    status: (h.status as VerifyStatus) ?? "pending",
    verdictBy: h.verdictBy ?? "",
    decidedAt: h.decidedAt ?? "",
    reminds: Number(h.reminds ?? 0),
    lastRemind: h.lastRemind ?? "",
  };
}

export async function setVerifyFields(
  valkey: Redis,
  id: string,
  fields: Record<string, string>,
): Promise<void> {
  await valkey.hset(verifyKey(id), fields);
}
