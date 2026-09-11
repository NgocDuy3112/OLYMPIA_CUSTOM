/**
 * Typed storage access — the ONLY place in the app that touches
 * localStorage/sessionStorage directly.
 *
 * All access is SSR-safe, try/catch guarded (Safari private mode, quota
 * errors) and centralized so the storage backend can be swapped later.
 */

interface SyncStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

function createSyncStore(backend: () => Storage | undefined): SyncStore {
  return {
    get(key) {
      try {
        return backend()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        backend()?.setItem(key, value);
      } catch {
        // Storage full / disabled — ignore.
      }
    },
    remove(key) {
      try {
        backend()?.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

export const localStore = createSyncStore(() =>
  typeof window === "undefined" ? undefined : window.localStorage,
);
export const sessionStore = createSyncStore(() =>
  typeof window === "undefined" ? undefined : window.sessionStorage,
);

/** Well-known identity keys. */
export const storageKeys = {
  matchCode: "matchCode",
  playerCode: "playerCode",
  mcCode: "mcCode",
  userRole: "user_role",
  userCode: "user_code",
  userName: "user_name",
} as const;

/** Per-match namespaced key prefixes (value is appended with the match code). */
export const matchStoragePrefixes = {
  chungMeta: "vd_chung_meta_",
  chungCodes: "vd_chung_codes_",
  riengCodes: "vd_rieng_codes_",
  riengSelectedPlayer: "vd_rieng_selected_player_",
  usedCodes: "vd_used_codes_",
  powers: "vd_powers_",
  pickAllCodes: "vd_pick_all_codes_",
  pickSelected: "vd_pick_selected_",
} as const;

// ── Identity helpers ─────────────────────────────────────────────────────────

export function getMatchCode(): string {
  return localStore.get(storageKeys.matchCode) ?? "";
}
export function setMatchCode(code: string): void {
  localStore.set(storageKeys.matchCode, code);
}
export function removeMatchCode(): void {
  localStore.remove(storageKeys.matchCode);
}

export function getPlayerCode(): string {
  return sessionStore.get(storageKeys.playerCode) ?? "";
}
export function setPlayerCode(code: string): void {
  sessionStore.set(storageKeys.playerCode, code);
}

export function getMcCode(): string {
  return sessionStore.get(storageKeys.mcCode) ?? "";
}
export function setMcCode(code: string): void {
  sessionStore.set(storageKeys.mcCode, code);
}

export function getUserRole(): string {
  return sessionStore.get(storageKeys.userRole) ?? "";
}
export function setUserRole(role: string): void {
  sessionStore.set(storageKeys.userRole, role);
}

export function getUserCode(): string {
  return sessionStore.get(storageKeys.userCode) ?? "";
}
export function setUserCode(code: string): void {
  sessionStore.set(storageKeys.userCode, code);
}

export function getUserName(): string {
  return sessionStore.get(storageKeys.userName) ?? "";
}
export function setUserName(name: string): void {
  sessionStore.set(storageKeys.userName, name);
}

/** Clear the auth session written by AuthCallbackPage. */
export function clearAuthSession(): void {
  sessionStore.remove(storageKeys.userRole);
  sessionStore.remove(storageKeys.userCode);
  sessionStore.remove(storageKeys.userName);
  localStore.remove(storageKeys.matchCode);
}

// ── JSON helpers ─────────────────────────────────────────────────────────────

export function readJson<T>(key: string, fallback: T): T {
  const raw = localStore.get(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStore.set(key, JSON.stringify(value));
  } catch {
    // ignore serialization errors
  }
}

export function removeKey(key: string): void {
  localStore.remove(key);
}

// ── Per-match namespaced helpers ─────────────────────────────────────────────

export function readMatchJson<T>(
  prefix: string,
  matchCode: string | null | undefined,
  fallback: T,
): T {
  if (!matchCode) return fallback;
  return readJson(`${prefix}${matchCode}`, fallback);
}

export function writeMatchJson(
  prefix: string,
  matchCode: string | null | undefined,
  value: unknown,
): void {
  if (!matchCode) return;
  writeJson(`${prefix}${matchCode}`, value);
}

export function readMatchString(
  prefix: string,
  matchCode: string | null | undefined,
): string {
  if (!matchCode) return "";
  return localStore.get(`${prefix}${matchCode}`) ?? "";
}

export function writeMatchString(
  prefix: string,
  matchCode: string | null | undefined,
  value: string,
): void {
  if (!matchCode) return;
  localStore.set(`${prefix}${matchCode}`, value);
}

export function removeMatchKey(
  prefix: string,
  matchCode: string | null | undefined,
): void {
  if (!matchCode) return;
  localStore.remove(`${prefix}${matchCode}`);
}
