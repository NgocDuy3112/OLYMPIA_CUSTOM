export function refusalOf(error: unknown): string | null {
    if (!error) return null
    if (error instanceof Error) return error.message
    return "Không gửi được — thử lại"
}

export function flashOf(...errors: unknown[]): string | null {
    for (const error of errors) {
        const refusal = refusalOf(error)
        if (refusal) return refusal
    }
    return null
}
