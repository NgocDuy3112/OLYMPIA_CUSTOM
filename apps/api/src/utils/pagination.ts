export function clampLimit(raw: unknown, def = 50, max = 100): number {
  return Math.min(Math.max(Number(raw) || def, 1), max);
}

export function clampPage(raw: unknown): number {
  return Math.max(Number(raw) || 1, 1);
}

export function clampOffset(raw: unknown): number {
  return Math.max(Number(raw) || 0, 0);
}
