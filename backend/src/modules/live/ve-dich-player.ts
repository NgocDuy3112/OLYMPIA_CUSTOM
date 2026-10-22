// A player's ve-dich commands: pick a question (phase 1), pick three (phase 2), declare a
// power, or buzz. All of them change round state, so they run through mutateLive. The
// playerId always comes from the session, never from the message.
import type { VeDichAction } from "./actions.js";
import { mutateLive, type Transition } from "./apply.js";
import { pgLiveStore } from "./store.js";
import { parseVeDichState } from "./state.js";
import { VE_DICH_DEFAULTS } from "../../game/engine/rules.js";
import { applyVeDichAction } from "./ve-dich.js";
import { loadContext, SubmitError, type SubmitContext } from "./submit.js";
import { publish } from "./hub.js";

export type VeDichCommand =
    | { type: "pick"; questionId: string }
    | { type: "pickBatch"; questionIds: string[] }
    | { type: "power"; power: "HOPE" | "SHIELD" }
    | { type: "buzz"; questionId: string };

export interface VeDichCommandResult {
    applied: VeDichCommand["type"];
}

export async function submitVeDichCommand(
    ctx: { matchId: string; userId: string; command: VeDichCommand; ip?: string | null; userAgent?: string | null }
): Promise<VeDichCommandResult> {
    const { matchId, userId, command } = ctx;

    const context: SubmitContext = {
        matchId,
        userId,
        questionId: "",
        value: null,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null
    };
    const { live } = await loadContext(context);
    if (live.roundId !== "ve-dich") {
        throw new SubmitError(409, "NO_ROUND", `round ${live.roundId} is not ve-dich`);
    }

    const action = toAction(command, userId);
    const now = new Date().toISOString();

    await mutateLive(
        pgLiveStore<Record<string, unknown>>(matchId),
        (current): Transition<Record<string, unknown>> => {
            const state = parseVeDichState(current.state);
            const { state: next, facts } = applyVeDichAction(state, action, {
                actorId: userId,
                roundId: current.roundId,
                now,
                rules: VE_DICH_DEFAULTS,
                questions: [],       // only start needs these, and only the MC starts
                players: [],
                drafts: []
            });
            return { state: next as unknown as Record<string, unknown>, facts };
        }
    );

    await publish(matchId);
    return { applied: command.type };
}

function toAction(command: VeDichCommand, playerId: string): VeDichAction {
    switch (command.type) {
        case "pick":
            return { kind: "ve-dich.pick", playerId, questionId: command.questionId };
        case "pickBatch":
            return { kind: "ve-dich.pickBatch", playerId, questionIds: command.questionIds };
        case "power":
            return { kind: "ve-dich.declarePower", playerId, power: command.power };
        case "buzz":
            return { kind: "ve-dich.buzz", playerId };
    }
}
