import { recordOral, beginPhase2, startKhoiDong, type KhoiDongState } from "../../../src/game/engine/turns/khoi-dong-round.js";

export function finishSetup(playerIds: string[], phase1Ids: string[], _phase2Ids: string[]): KhoiDongState {
    let state = startKhoiDong(playerIds, phase1Ids);
    for (let i = 0; i < playerIds.length * phase1Ids.length; i++) {
        if (state.stage !== "phase1") break;
        state = recordOral(state, { correct: false, spentS: 1 });
    }
    return state;
}

export { beginPhase2 };
