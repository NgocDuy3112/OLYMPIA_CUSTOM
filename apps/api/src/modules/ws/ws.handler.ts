/**
 * WebSocket message handler.
 */

import type { WebSocket } from "ws";
import type { WsConnection, WsMessage } from "./ws.types.js";
import { isAllowedByRole } from "./ws.types.js";
import { manager } from "./ws.manager.js";
import { matchState } from "../../state/match-state.js";
import {
  tryAcquireBuzzerLock,
  setBuzzerWinner,
  getBuzzerWinners,
  activateBuzzerWindow,
  isBuzzerWindowActive,
  clearBuzzerState,
} from "../../state/locks.js";
import { getEngine } from "@oc/engine";
import { persistScoreDeltas } from "../scoreboard/score.service.js";

export async function handleWsMessage(
  _ws: WebSocket,
  conn: WsConnection,
  data: WsMessage,
): Promise<void> {
  const msgType = data.type || "";

  if (msgType === "user_online" || !data.user_code) {
    data.user_code = conn.userCode;
  }
  data.role = conn.role;

  if (!isAllowedByRole(conn.role, msgType)) return;
  if (msgType === "user_online" && data.status === "heartbeat") return;

  if (msgType === "request_snapshot") {
    await sendSnapshot(conn);
    return;
  }

  if (msgType.startsWith("camera_") || msgType.startsWith("voice_")) {
    const target =
      typeof data.target_user_code === "string"
        ? data.target_user_code
        : undefined;
    if (msgType === "camera_ready" || msgType === "voice_ready") {
      await manager.broadcast(conn.matchCode, {
        ...data,
        user_code: conn.userCode,
      });
    } else if (target === "mc" && msgType === "voice_request") {
      await manager.sendToRoles(conn.matchCode, ["mc", "admin"], {
        ...data,
        user_code: conn.userCode,
        target_user_code: target,
      });
    } else if (target) {
      await manager.sendToUser(conn.matchCode, target, {
        ...data,
        user_code: conn.userCode,
        target_user_code: target,
      });
    }
    return;
  }

  if (msgType === "buzzer_activated") {
    const questionCode = typeof data.question_code === "string" ? data.question_code : "";
    if (questionCode && manager.valkey) await activateBuzzerWindow(manager.valkey, conn.matchCode, questionCode, Number(data.countdown) || 5);
  }

  if (msgType === "clear_buzz") {
    if (manager.valkey) await clearBuzzerState(manager.valkey, conn.matchCode, typeof data.question_code === "string" ? data.question_code : undefined);
    await manager.broadcast(conn.matchCode, data as Record<string, unknown>);
    return;
  }

  if (msgType === "buzz") {
    await handleBuzz(conn, data);
    return;
  }

  await handleEngineAction(conn, data);
  await manager.broadcast(conn.matchCode, data as Record<string, unknown>);
}

async function handleEngineAction(
  conn: WsConnection,
  data: WsMessage,
): Promise<void> {
  const engine = getEngine(conn.tournamentFormat);
  const valkey = manager.valkey;
  if (!valkey) return;

  const stored = await matchState.getField<Record<string, unknown>>(
    valkey,
    conn.matchCode,
    "engine_state",
  );
  const state = stored ?? engine.initMatch(conn.matchCode);
  const action = {
    type: data.type,
    userCode: (data.user_code as string) || conn.userCode,
    matchCode: conn.matchCode,
    phase:
      (data.phase as string) || (state as any).currentPhase || engine.phases[0],
    payload: data as Record<string, unknown>,
  };
  const result = engine.handleAction(state as never, action as never);
  if (!result.ok) {
    await manager.sendToUser(conn.matchCode, conn.userCode, {
      type: "engine_error",
      code: result.error.code,
      message: result.error.message,
    });
    return;
  }

  if (result.scoreDeltas.length > 0) {
    try {
      await persistScoreDeltas(conn.matchCode, action, result.scoreDeltas);
    } catch (error) {
      await manager.sendToUser(conn.matchCode, conn.userCode, {
        type: "engine_error",
        code: "SCORE_PERSIST_FAILED",
        message:
          error instanceof Error ? error.message : "Failed to persist score",
      });
      return;
    }
  }

  await matchState.setField(
    valkey,
    conn.matchCode,
    "engine_state",
    result.value,
  );
  for (const event of result.events) {
    await manager.broadcast(conn.matchCode, event);
  }

  for (const delta of result.scoreDeltas) {
    await manager.broadcast(conn.matchCode, {
      type: "score_delta",
      match_code: conn.matchCode,
      user_code: delta.userCode,
      points: delta.points,
      reason: delta.reason,
    });
  }
}

async function handleBuzz(conn: WsConnection, data: WsMessage): Promise<void> {
  const questionCode = data.question_code as string;
  if (!questionCode) return;
  if (conn.role !== "player") return;

  const valkey = manager.valkey;
  if (!valkey) return;
  if (!(await isBuzzerWindowActive(valkey, conn.matchCode, questionCode))) {
    await manager.sendToUser(conn.matchCode, conn.userCode, { type: "buzz_rejected", user_code: conn.userCode, question_code: questionCode, reason: "window_closed" });
    return;
  }

  const token = await tryAcquireBuzzerLock(
    valkey,
    conn.matchCode,
    questionCode,
  );
  if (!token) {
    await manager.sendToUser(conn.matchCode, conn.userCode, {
      type: "blocked_buzz",
      question_code: questionCode,
      user_code: conn.userCode,
    });
    return;
  }

  await setBuzzerWinner(valkey, conn.matchCode, questionCode, conn.userCode);
  await manager.broadcast(conn.matchCode, {
    type: "buzzer_winner",
    user_code: conn.userCode,
    match_code: conn.matchCode,
    question_code: questionCode,
  });
}

async function sendSnapshot(conn: WsConnection): Promise<void> {
  const valkey = manager.valkey;
  if (!valkey) return;

  try {
    const messages = await matchState.getSnapshotMessages(
      valkey,
      conn.matchCode,
    );
    for (const msg of messages) {
      try {
        if (conn.ws.readyState === 1) {
          conn.ws.send(JSON.stringify(msg));
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* non-fatal */
  }
}

export async function handleReconnect(conn: WsConnection): Promise<void> {
  const valkey = manager.valkey;
  if (!valkey) return;

  await manager.broadcast(conn.matchCode, {
    type: `${conn.role}_reconnected`,
    user_code: conn.userCode,
  });

  try {
    const winners = await getBuzzerWinners(valkey, conn.matchCode);
    for (const [questionCode, winnerCode] of Object.entries(winners)) {
      if (conn.ws.readyState === 1) {
        conn.ws.send(
          JSON.stringify({
            type: "buzzer_winner",
            user_code: winnerCode,
            match_code: conn.matchCode,
            question_code: questionCode,
          }),
        );
      }
    }
  } catch {
    /* non-fatal */
  }
}
