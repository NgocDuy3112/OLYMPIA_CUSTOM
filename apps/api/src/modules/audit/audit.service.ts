/**
 * File audit service — JSONL append-only, daily rotation.
 *
 * Writes to logs/audit-<YYYY-MM-DD>.log (one JSON object per line).
 * Rotation is by date: filename changes at midnight, old files stay.
 * Keeps last 30 files, deletes older ones on write.
 */

import { appendFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

const VALID_ACTIONS = [
  "LOGIN",
  "LOGOUT",
  "SCORE_CHANGE",
  "MATCH_STATE_CHANGE",
  "PLAYER_JOIN",
  "PLAYER_LEAVE",
  "QUESTION_USED",
  "MATCH_CREATED",
  "MATCH_DELETED",
] as const;

export type AuditAction = (typeof VALID_ACTIONS)[number];

export interface AuditEntry {
  id: string;
  actionType: AuditAction;
  actorCode?: string | null;
  matchCode?: string | null;
  targetCode?: string | null;
  details?: string | null;
  createdAt: string;
}

function auditDir(): string {
  return process.env.AUDIT_LOG_DIR ?? "logs";
}

function dayString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function auditFile(day = dayString()): string {
  return join(auditDir(), `audit-${day}.log`);
}

let idCounter = 0;

function newId(): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Fire-and-forget audit write — never throws. */
export async function writeAudit(entry: {
  actionType: AuditAction;
  actorCode?: string | null;
  matchCode?: string | null;
  targetCode?: string | null;
  details?: string | null;
}): Promise<void> {
  try {
    await mkdir(auditDir(), { recursive: true });
    const record: AuditEntry = {
      id: newId(),
      actionType: entry.actionType,
      actorCode: entry.actorCode ?? null,
      matchCode: entry.matchCode ?? null,
      targetCode: entry.targetCode ?? null,
      details: entry.details ?? null,
      createdAt: new Date().toISOString(),
    };
    await appendFile(auditFile(), `${JSON.stringify(record)}\n`, "utf8");
    void pruneOldFiles();
  } catch {
    /* audit must never break the main flow */
  }
}

const KEEP_FILES = 30;

async function pruneOldFiles(): Promise<void> {
  try {
    const files = (await readdir(auditDir())).filter(
      (f) => f.startsWith("audit-") && f.endsWith(".log"),
    );
    if (files.length <= KEEP_FILES) return;
    const withTime = await Promise.all(
      files.map(async (f) => {
        try {
          const s = await stat(join(auditDir(), f));
          return { f, mtime: s.mtimeMs };
        } catch {
          return { f, mtime: 0 };
        }
      }),
    );
    withTime.sort((a, b) => a.mtime - b.mtime);
    const excess = withTime.slice(0, withTime.length - KEEP_FILES);
    await Promise.all(excess.map(({ f }) => unlink(join(auditDir(), f)).catch(() => undefined)));
  } catch {
    /* ignore prune errors */
  }
}

export { VALID_ACTIONS, auditDir, auditFile };
