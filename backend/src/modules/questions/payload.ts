import type { QuestionPayload } from "../../game/contracts/index.js";
import { QuestionError } from "./errors.js";

export type QuestionKindValue = "MC" | "TEXT" | "KEYWORD";

function fail(message: string, details: string[] = []): never {
    throw new QuestionError("VALIDATION", message, details);
}

export function assertPayloadForKind(kind: QuestionKindValue, payload: QuestionPayload): void {
    const p = payload as Record<string, unknown>;

    if (kind === "MC") {
        if (!Array.isArray(p.options) || !Array.isArray(p.correctSet)) {
            fail("MC questions require payload.options and payload.correctSet");
        }

        const options = p.options as Array<{ id: string }>;
        const correctSet = p.correctSet as string[];

        if (options.length === 0) fail("MC questions require at least one option");
        if (correctSet.length === 0) fail("MC questions require a non-empty correctSet");

        const ids = options.map((option) => option.id);
        if (new Set(ids).size !== ids.length) fail("MC option ids must be unique");

        const unknown = correctSet.filter((id) => !ids.includes(id));
        if (unknown.length > 0) {
            fail(
                "correctSet must reference existing option ids",
                unknown.map((id) => `unknown option id "${id}"`)
            );
        }
        return;
    }

    if (kind === "TEXT") {
        if (!Array.isArray(p.acceptedAnswers)) {
            fail("TEXT questions require payload.acceptedAnswers");
        }
        if ((p.acceptedAnswers as string[]).length === 0) {
            fail("TEXT questions require at least one accepted answer");
        }
        if (typeof p.normalize !== "object" || p.normalize === null) {
            fail("TEXT questions require payload.normalize");
        }
        return;
    }

    if (typeof p.code !== "string" || p.code.length === 0) {
        fail("KEYWORD questions require a non-empty payload.code");
    }
    if (typeof p.normalize !== "object" || p.normalize === null) {
        fail("KEYWORD questions require payload.normalize");
    }
}
