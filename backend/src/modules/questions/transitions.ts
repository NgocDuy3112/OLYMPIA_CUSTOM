import { QuestionError } from "./errors.js";

export type QuestionStatusValue = "DRAFT" | "PENDING" | "PUBLISHED" | "ARCHIVED";
export type ActorRole = "ADMIN" | "OPERATOR" | "PLAYER";

const EDGES: Record<QuestionStatusValue, QuestionStatusValue[]> = {
    DRAFT: ["PENDING", "ARCHIVED"],
    PENDING: ["DRAFT", "PUBLISHED", "ARCHIVED"],
    PUBLISHED: ["PENDING", "ARCHIVED"],
    ARCHIVED: []
};

const ADMIN_ONLY = new Set<string>(["PENDING→PUBLISHED"]);

export function assertTransition(
    from: QuestionStatusValue,
    to: QuestionStatusValue,
    role: ActorRole
): void {
    if (!EDGES[from].includes(to)) {
        throw new QuestionError(
            "INVALID_TRANSITION",
            `cannot move a question from ${from} to ${to}`,
            [`allowed from ${from}: ${EDGES[from].join(", ") || "none"}`]
        );
    }

    if (ADMIN_ONLY.has(`${from}→${to}`) && role !== "ADMIN") {
        throw new QuestionError(
            "FORBIDDEN",
            `only an admin may move a question from ${from} to ${to}`
        );
    }
}
