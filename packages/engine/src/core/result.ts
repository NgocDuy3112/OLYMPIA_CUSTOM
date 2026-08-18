import type { ScoreDelta } from "../types.js";

export type Result<T> =
  | { ok: true; value: T; events: DomainEvent[]; scoreDeltas: ScoreDelta[] }
  | { ok: false; error: DomainError };

export interface DomainError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DomainEvent {
  type: string;
  [key: string]: unknown;
}

export const success = <T>(
  value: T,
  events: DomainEvent[] = [],
  scoreDeltas: ScoreDelta[] = [],
): Result<T> => ({
  ok: true,
  value,
  events,
  scoreDeltas,
});

export const failure = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Result<never> => ({
  ok: false,
  error: { code, message, details },
});
