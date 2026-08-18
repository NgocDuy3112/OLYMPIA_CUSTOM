/**
 * Unified Valkey state — 1 hash = 1 match.
 *
 * All real-time state for a match lives in snapshot:{matchCode}.
 * This module provides the single access point for reading/writing.
 */

import type Redis from "ioredis";

const SNAPSHOT_PREFIX = "snapshot:";
const SNAPSHOT_TTL = 3 * 60 * 60; // 3 hours

function snapshotKey(matchCode: string): string {
  return `${SNAPSHOT_PREFIX}${matchCode}`;
}

async function getField<T = unknown>(
  valkey: Redis,
  matchCode: string,
  field: string,
): Promise<T | null> {
  const raw = await valkey.hget(snapshotKey(matchCode), field);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

async function setField(
  valkey: Redis,
  matchCode: string,
  field: string,
  value: unknown,
): Promise<void> {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  await valkey.hset(snapshotKey(matchCode), field, serialized);
  await valkey.expire(snapshotKey(matchCode), SNAPSHOT_TTL);
}

async function delFields(
  valkey: Redis,
  matchCode: string,
  ...fields: string[]
): Promise<void> {
  if (fields.length === 0) return;
  await valkey.hdel(snapshotKey(matchCode), ...fields);
  await valkey.expire(snapshotKey(matchCode), SNAPSHOT_TTL);
}

async function clearSnapshot(valkey: Redis, matchCode: string): Promise<void> {
  await valkey.del(snapshotKey(matchCode));
}

async function getAllFields(
  valkey: Redis,
  matchCode: string,
): Promise<Record<string, unknown>> {
  const raw = await valkey.hgetall(snapshotKey(matchCode));
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    try {
      result[k] = JSON.parse(v);
    } catch {
      result[k] = v;
    }
  }
  return result;
}

// ── Round state ──

export interface QuestionData {
  question_code: string;
  content: string;
  media_url?: string | null;
  options?: string[];
  answer?: string;
}

export interface TimerData {
  time_limit: number;
  started_at: number;
  phase?: string;
}

export interface VideoData {
  action: "play" | "pause" | "stop";
  source?: string;
}

export const matchState = {
  // ── Generic field access ──
  getField,
  setField,
  delFields,
  clearSnapshot,
  getAllFields,

  // ── Current question ──
  getQuestion: (valkey: Redis, matchCode: string) =>
    getField<QuestionData>(valkey, matchCode, "current_question"),
  setQuestion: (valkey: Redis, matchCode: string, q: QuestionData) =>
    setField(valkey, matchCode, "current_question", q),

  // ── Timer ──
  getTimer: (valkey: Redis, matchCode: string) =>
    getField<TimerData>(valkey, matchCode, "timer"),
  setTimer: (valkey: Redis, matchCode: string, t: TimerData) =>
    setField(valkey, matchCode, "timer", t),

  // ── Answers ──
  getAnswers: (valkey: Redis, matchCode: string) =>
    getField<Record<string, unknown>>(valkey, matchCode, "answers"),
  setAnswers: (valkey: Redis, matchCode: string, a: Record<string, unknown>) =>
    setField(valkey, matchCode, "answers", a),
  clearAnswers: (valkey: Redis, matchCode: string) =>
    delFields(valkey, matchCode, "answers", "keyword_answers"),

  // ── Video ──
  getVideo: (valkey: Redis, matchCode: string) =>
    getField<VideoData>(valkey, matchCode, "video"),
  setVideo: (valkey: Redis, matchCode: string, v: VideoData) =>
    setField(valkey, matchCode, "video", v),

  // ── VeDich turn player ──
  getTurnPlayer: (valkey: Redis, matchCode: string) =>
    valkey.get(`vd:turn:${matchCode}`).then((v) => v || null),
  setTurnPlayer: (valkey: Redis, matchCode: string, userCode: string) =>
    valkey.set(`vd:turn:${matchCode}`, userCode),
  clearTurnPlayer: (valkey: Redis, matchCode: string) =>
    valkey.del(`vd:turn:${matchCode}`),

  // ── VeDich powers ──
  getUsedPowers: async (
    valkey: Redis,
    matchCode: string,
  ): Promise<Record<string, string>> => {
    const raw = await valkey.hgetall(`vd:powers:${matchCode}`);
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === "star" || v === "shield") result[k] = v;
    }
    return result;
  },
  setUsedPower: async (
    valkey: Redis,
    matchCode: string,
    userCode: string,
    power: string,
  ): Promise<{ powers: Record<string, string>; changed: boolean }> => {
    if (power !== "star" && power !== "shield") {
      const powers = await matchState.getUsedPowers(valkey, matchCode);
      return { powers, changed: false };
    }
    const key = `vd:powers:${matchCode}`;
    const changed = (await valkey.hsetnx(key, userCode, power)) === 1;
    await valkey.expire(key, 86400);
    const powers = await matchState.getUsedPowers(valkey, matchCode);
    return { powers, changed };
  },

  // ── Snapshot for reconnect ──
  getSnapshotMessages: async (
    valkey: Redis,
    matchCode: string,
  ): Promise<Record<string, unknown>[]> => {
    const data = await getAllFields(valkey, matchCode);
    const replayOrder = [
      "qualifier_round",
      "vd_selected_chung",
      "vd_selected_rieng",
      "vdc_meta",
      "vdr_meta",
      "vdc_question_states",
      "vdr_question_states",
      "current_question",
      "timer",
      "video",
      "answers",
      "vd_selection_update",
      "keyword_info",
      "keyword_clues_locked",
      "keyword_answers",
      "keyword_answer",
      "qualifier_round_result",
    ];
    const messages: Record<string, unknown>[] = [];
    for (const field of replayOrder) {
      const value = data[field];
      if (!value) continue;
      if (
        (field === "vdc_question_states" || field === "vdr_question_states") &&
        typeof value === "object"
      ) {
        for (const m of Object.values(value as Record<string, unknown>)) {
          if (typeof m === "object" && m !== null)
            messages.push(m as Record<string, unknown>);
        }
      } else if (typeof value === "object" && value !== null) {
        messages.push(value as Record<string, unknown>);
      }
    }
    return messages;
  },
};
