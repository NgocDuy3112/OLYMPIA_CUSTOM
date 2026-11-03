// The refusal FLASH — what the Status slot says after a rejected action.
//
// A refusal is not a crash: the player's write was rejected because the window
// moved on (409) or the batch closed, and the deck must say so in the same slot
// it uses for any other note. The FIRST mutation with an error wins, in the
// order the controls appear, so two refusals never fight over the line.

/** One mutation's error as a line of copy (null: it did not fail). */
export function refusalOf(error: unknown): string | null {
    if (!error) return null
    if (error instanceof Error) return error.message
    return "Không gửi được — thử lại"
}

/** The flash: the first refusal among the given mutations, in priority order. */
export function flashOf(...errors: unknown[]): string | null {
    for (const error of errors) {
        const refusal = refusalOf(error)
        if (refusal) return refusal
    }
    return null
}
