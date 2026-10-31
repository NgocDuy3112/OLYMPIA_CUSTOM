/**
 * useGameAudio — client-side replacement for the Discord BGM/SFX bots.
 *
 * Mirrors the two bots' behaviour but plays through the browser instead of a
 * Discord voice channel:
 *
 *   phase intro music, `{phase}_{N}s` timer music, timer-end
 *   queue-based SFX with phase-specific overrides
 *
 * Rounds `kdc` (Khởi Động Chung), `gm` (Giải Mã) and `vdc` (Về Đích Chung)
 * have been removed from the app, so they are deliberately absent from the
 * phase maps below — only `kdr`, `bp` and `vdr` are reachable.
 *
 * Audio is resolved against the existing S3 layout (`audios/bgm/`,
 * `audios/sfx/`) via `POST /media/presign-batch/`. That endpoint silently
 * omits keys that do not exist, which lets us probe the extension
 * (`.mp3` / `.ogg` / `.wav`) in a single request rather than hardcoding a
 * manifest — the bucket holds more files than the docs list.
 *
 * Autoplay is best-effort: browsers block audio until a user gesture, so every
 * `play()` rejection is swallowed. No unlock UI is rendered (by design).
 */

import { useCallback, useEffect, useRef } from "react";
import { API_BASE_URL } from "@/configs";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { createLogger } from "@/utils/logger";

const logger = createLogger("useGameAudio");

/* ── Types ───────────────────────────────────────────────────────────────── */

export type GamePhase = "kdr" | "bp" | "vdr";
export type AudioChannel = "bgm" | "sfx" | "ping";

type PhaseSfxMap = Record<string, string>;

export interface UseGameAudioOptions {
    /** Set false to mute this client entirely. Defaults to true. */
    enabled?: boolean;
    /** 0–1. Defaults to 1. */
    volume?: number;
}

/* ── Maps (ported from the bots, pruned to the surviving rounds) ─────────── */

/**
 * Phase → event → SFX basename, restricted to kdr / bp / vdr.
 * Phase-specific entries take priority over EVENT_SFX_MAP.
 */
const PHASE_EVENT_SFX_MAP: Record<GamePhase, PhaseSfxMap> = {
    kdr: {
        round_start: "kd_bat_dau",
        send_answers_to_players: "kd_hien_tra_loi",
        wrong: "kd_sai",
        skip: "kd_sai",
        player_wrong_attempt: "kd_sai",
        kd_cong_diem: "kd_dung",
        round_end: "kd_ket_thuc",
    },
    bp: {
        round_start: "bp_bat_dau",
        bp_chon_cau_hoi: "bp_chon_cau_hoi",
        bp_dung: "bp_dung",
        send_answers_to_players: "bp_hien_tra_loi",
    },
    vdr: {
        round_start: "vd_bat_dau",
        round_end: "vd_ket_thuc",
        wrong: "vd_sai",
        vd_dung: "vd_dung",
        send_answers_to_players: "vd_hien_tra_loi",
        vd_selection_update: "vd_pick",
        vd_questions_selected: "vd_xac_nhan",
        power_star: "vd_quyen_nang",
        power_shield: "vd_quyen_nang",
    },
};

/** Generic (phase-independent) SFX — `the Discord generic event→SFX map`. */
const EVENT_SFX_MAP: PhaseSfxMap = {
    open_match: "mo_tran_dau",
    introduce_players: "gioi_thieu_thi_sinh",
    show_scoreboard: "tong_ket_diem_so",
    end_match: "ket_thuc_tran_dau",
};

/**
 * Ping cues.
 *
 * These files live under `audios/ping/`, not `audios/sfx/`, and each is only
 * valid in specific phases.
 */
const PING_EVENT_MAP: Record<string, { file: string; phases: readonly string[] }> = {
    keyword_submit: { file: "gm_ping", phases: ["gm"] },
    buzzer_winner: { file: "vd_ping", phases: ["vdr"] },
};

/**
 * Timer filenames use a shorter prefix than the phase name —
 * e.g. phase `vdr` plays `vd_30s`, not `vdr_30s`.
 */
const TIMER_PREFIX: Record<string, string> = {
    vdc: "vd",
    vdr: "vd",
    gm_keyword: "gm",
};

const TIMER_END_SFX = "timer_end";
const ACTIVE_PHASES: readonly string[] = ["kdr", "bp", "vdr"];
const KNOWN_EXTS = ["mp3", "ogg", "wav"] as const;
const THROTTLE_MS = 150;

/* ── URL resolution ──────────────────────────────────────────────────────── */

/** Shared across mounts so re-mounting does not re-presign everything. */
const urlCache = new Map<string, string | null>();

function getAuthToken(): string {
    try {
        return (
            localStorage.getItem("jwtToken_admin") ??
            sessionStorage.getItem("jwtToken_mc") ??
            sessionStorage.getItem("jwtToken_player") ??
            ""
        );
    } catch {
        return "";
    }
}

/**
 * Resolve `audios/{channel}/{basename}.{ext}` to a presigned URL.
 * Caches hits and misses; network failures are NOT cached so a later
 * event can retry.
 */
async function resolveAudioUrl(
    channel: AudioChannel,
    basename: string,
): Promise<string | null> {
    const cacheKey = `${channel}/${basename.toLowerCase()}`;
    const cached = urlCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const keys = KNOWN_EXTS.map((ext) => `audios/${channel}/${basename}.${ext}`);

    try {
        const token = getAuthToken();
        const res = await fetch(`${API_BASE_URL}/media/presign-batch/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ keys }),
        });
        if (!res.ok) throw new Error(`presign-batch HTTP ${res.status}`);

        const payload = (await res.json()) as { urls?: Record<string, string> };
        const urls = payload.urls ?? {};
        const hit = keys.map((k) => urls[k]).find((u): u is string => Boolean(u)) ?? null;

        urlCache.set(cacheKey, hit);
        if (!hit) logger.warn(`No audio file for ${channel}/${basename} (tried ${KNOWN_EXTS.join(", ")})`);
        return hit;
    } catch (err) {
        logger.error(`Failed to presign ${channel}/${basename}:`, err);
        return null;
    }
}

/* ── Message helpers ─────────────────────────────────────────────────────── */

/** Phase is the segment after `/player/`. */
function extractPhase(path: unknown): string | null {
    if (typeof path !== "string") return null;
    const parts = path.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length >= 2 && parts[0] === "player") return parts[1];
    return null;
}

/**
 * Unwrap either a raw payload or the `{ message: payload }` envelope the
 * backend sometimes forwards. Mirrors `msg?.message ?? msg` used elsewhere.
 */
function unwrap(raw: unknown): Record<string, unknown> | null {
    if (typeof raw === "string") {
        try {
            return unwrap(JSON.parse(raw));
        } catch {
            return null;
        }
    }
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    const inner = obj.message;
    if (inner && typeof inner === "object") return inner as Record<string, unknown>;
    return obj;
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

export function useGameAudio(options: UseGameAudioOptions = {}) {
    const { enabled = true, volume = 1 } = options;
    const { lastMessage } = useGameWebSocket();

    const bgmRef = useRef<HTMLAudioElement | null>(null);
    const sfxRef = useRef<HTMLAudioElement | null>(null);
    const sfxQueueRef = useRef<string[]>([]);
    const sfxPlayingRef = useRef(false);
    const phaseRef = useRef<string>("");
    const lastHandledRef = useRef<unknown>(null);
    const throttleRef = useRef<Map<string, number>>(new Map());
    const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

    /* — playback primitives — */

    const stopBgm = useCallback(() => {
        const el = bgmRef.current;
        if (!el) return;
        try {
            el.pause();
            el.removeAttribute("src");
            el.load();
        } catch {
            /* ignore */
        }
        bgmRef.current = null;
    }, []);

    const playBgm = useCallback(
        async (basename: string, channel: AudioChannel = "bgm") => {
            const url = await resolveAudioUrl(channel, basename);
            if (!url) return;
            stopBgm();
            const el = new Audio(url);
            el.volume = Math.min(1, Math.max(0, volume));
            el.loop = false;
            bgmRef.current = el;
            void el.play().catch((err) => {
                // Autoplay policy — best-effort, no UI (by design).
                logger.debug("BGM play blocked:", err);
            });
        },
        [stopBgm, volume],
    );

    /**
     * Explicit type param avoids TS7022: `drainSfx` recurses into itself, so
     * without an annotation TS complains about a circular initializer.
     */
    const drainSfx = useCallback<() => void>(() => {
        const next = sfxQueueRef.current.shift();
        if (!next) {
            sfxPlayingRef.current = false;
            return;
        }
        const el = new Audio(next);
        el.volume = Math.min(1, Math.max(0, volume));
        sfxRef.current = el;

        const advance = () => {
            sfxRef.current = null;
            drainSfx();
        };
        el.addEventListener("ended", advance, { once: true });
        el.addEventListener("error", advance, { once: true });

        void el.play().catch((err) => {
            logger.debug("SFX play blocked:", err);
            advance();
        });
    }, [volume]);

    /** Queue-based, sequential — never overlaps (matches the old SFX bot). */
    const playSfx = useCallback(
        async (basename: string, channel: AudioChannel = "sfx") => {
            const url = await resolveAudioUrl(channel, basename);
            if (!url) return;
            sfxQueueRef.current.push(url);
            if (!sfxPlayingRef.current) {
                sfxPlayingRef.current = true;
                drainSfx();
            }
        },
        [drainSfx],
    );

    /** `start_the_timer` → sleep `time_limit`, then play timer_end. */
    const scheduleTimerEnd = useCallback(
        (seconds: number) => {
            if (!Number.isFinite(seconds) || seconds <= 0) return;
            const id = setTimeout(() => {
                timersRef.current.delete(id);
                void playSfx(TIMER_END_SFX);
            }, seconds * 1000);
            timersRef.current.add(id);
        },
        [playSfx],
    );

    const throttled = useCallback((key: string): boolean => {
        const now = Date.now();
        const last = throttleRef.current.get(key) ?? 0;
        if (now - last < THROTTLE_MS) return true;
        throttleRef.current.set(key, now);
        return false;
    }, []);

    /** Phase-specific override wins over the generic map. */
    const resolveSfx = useCallback((eventType: string): string | null => {
        const phase = phaseRef.current as GamePhase | "";
        if (phase && PHASE_EVENT_SFX_MAP[phase as GamePhase]?.[eventType]) {
            return PHASE_EVENT_SFX_MAP[phase as GamePhase][eventType];
        }
        return EVENT_SFX_MAP[eventType] ?? null;
    }, []);

    /* — message handling — */

    useEffect(() => {
        if (!enabled || !lastMessage) return;
        if (lastHandledRef.current === lastMessage) return;
        lastHandledRef.current = lastMessage;

        const msg = unwrap(lastMessage);
        if (!msg) return;

        // Bots ignore data-only re-broadcasts so audio is not doubled up.
        if (msg.silent === true) return;

        const type = typeof msg.type === "string" ? msg.type : "";
        if (!type) return;

        switch (type) {
            case "navigate": {
                const phase = extractPhase(msg.path);
                if (!phase) return;
                if (ACTIVE_PHASES.includes(phase)) {
                    phaseRef.current = phase;
                } else {
                    // Unknown/removed phase — go quiet rather than play stale music.
                    phaseRef.current = "";
                    stopBgm();
                }
                return;
            }

            case "start_the_timer": {
                const timeLimit = Number(msg.time_limit ?? 0);
                const phase =
                    (typeof msg.phase === "string" && msg.phase) || phaseRef.current;
                if (!phase || !Number.isFinite(timeLimit) || timeLimit <= 0) {
                    logger.warn("start_the_timer without usable phase/time_limit:", msg);
                    return;
                }
                const prefix = TIMER_PREFIX[phase] ?? phase;
                void playBgm(`${prefix}_${timeLimit}s`);
                scheduleTimerEnd(timeLimit);
                return;
            }

            case "vd_power_activated": {
                const power = msg.power;
                if (power !== "star" && power !== "shield") {
                    // power === null means "deactivated" → no SFX at all.
                    return;
                }
                if (throttled(`power_${String(power)}`)) return;
                void playSfx("vd_quyen_nang");
                return;
            }

            case "answering_window_activated": {
                // Buzzer window 5s for Về Đích Riêng — vdr only.
                if (phaseRef.current !== "vdr") return;
                if (throttled("answering_window")) return;
                void playBgm("vd_5s");
                return;
            }

            case "vd_power_window_open": {
                // Power selection window 5s. Previously allowed vdc + vdr, but vdc
                // was removed from the app, so vdr is the only live phase.
                if (phaseRef.current !== "vdr") return;
                if (throttled("power_window")) return;
                void playBgm("vd_5s");
                return;
            }

            case "round_start": {
                // Intro jingle takes the BGM channel so the timer music
                // replaces it instead of overlapping.
                const intro = resolveSfx("round_start");
                if (intro && !throttled(`round_start_${phaseRef.current}`)) {
                    void playBgm(intro, "sfx");
                }
                return;
            }

            case "round_end": {
                stopBgm();
                const outro = resolveSfx("round_end");
                if (outro && !throttled(`round_end_${phaseRef.current}`)) {
                    void playSfx(outro);
                }
                return;
            }

            default: {
                // Ping cues: these live under audios/ping/ (not audios/sfx/)
                // and are gated per phase.
                const ping = PING_EVENT_MAP[type];
                if (ping) {
                    if (!ping.phases.includes(phaseRef.current)) return;
                    if (throttled(`ping_${type}`)) return;
                    void playSfx(ping.file, "ping");
                    return;
                }

                if (throttled(`${type}_${phaseRef.current}`)) return;
                const sfx = resolveSfx(type);
                if (sfx) void playSfx(sfx);
            }
        }
    }, [
        enabled,
        lastMessage,
        playBgm,
        playSfx,
        resolveSfx,
        scheduleTimerEnd,
        stopBgm,
        throttled,
    ]);

    /* — teardown — */

    useEffect(() => {
        const timers = timersRef.current;
        const throttle = throttleRef.current;
        return () => {
            timers.forEach((id) => clearTimeout(id));
            timers.clear();
            throttle.clear();
            sfxQueueRef.current = [];
            sfxPlayingRef.current = false;
            stopBgm();
            const sfx = sfxRef.current;
            if (sfx) {
                try {
                    sfx.pause();
                    sfx.removeAttribute("src");
                    sfx.load();
                } catch {
                    /* ignore */
                }
                sfxRef.current = null;
            }
        };
    }, [stopBgm]);

    return { stopBgm };
}

export default useGameAudio;
