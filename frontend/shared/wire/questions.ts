export type QuestionKind = "CHOICE" | "TEXT" | "KEYWORD"

export type QuestionMode = "oral" | "text"

export type MediaKind = "image" | "audio" | "video"

export interface QuestionMedia {
    url: string
    type: MediaKind
}

export interface ChoiceOption {
    id: string
    text: string
}

export type QuestionPayload =
    | { options: ChoiceOption[]; correctSet: string[] }
    | { acceptedAnswers: string[] }
    | { code: string }

export interface MatchQuestion {
    _id: string
    roundId: string
    turnId: string
    position: number
    mode: QuestionMode
    kind: QuestionKind
    questionText: string
    media: QuestionMedia | null
    points: number
    payload: QuestionPayload
    sourceId: string
}

export interface ConsoleQuestion {
    _id: string
    roundId: string
    turnId: string
    position: number
    kind: QuestionKind
    questionText: string
    points: number
    payload: QuestionPayload
}

export interface SanitizedPayload {
    options?: ChoiceOption[] | null
    codeLength?: number | null
}

export interface SanitizedQuestion {
    questionId: string
    kind: QuestionKind
    position: number
    questionText: string
    media: QuestionMedia | null
    payload: SanitizedPayload
}
