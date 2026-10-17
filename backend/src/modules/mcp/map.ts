import type { QuestionRow } from "../questions/service.js";


export interface AgentQuestion {
    id: string;
    kind: string;
    questionText: string;
    tag: string;
    status: string;
    usable: boolean;
    media: unknown;
    timeLimit: number | null;
    payload: unknown;
    tournamentId: string | null;
    createdAt: Date;
    updatedAt: Date;
}


export function toAgentQuestion(row: QuestionRow): AgentQuestion {
    return {
        id: row.id,
        kind: row.kind,
        questionText: row.questionText,
        tag: row.tag,
        status: row.status,
        usable: row.status === "PUBLISHED",
        media: row.media,
        timeLimit: row.timeLimit,
        payload: row.payload,
        tournamentId: row.tournamentId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}