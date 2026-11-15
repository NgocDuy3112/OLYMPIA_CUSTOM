export function discordValue(raw: string): string {
    const trimmed = raw.trim()
    if (trimmed === "" || DISCORD_SHAPE.test(trimmed)) return trimmed
    const extracted = trimmed.match(/(?:users\/|<@)([0-9]{15,30})>?/)
    if (extracted) return extracted[1]
    return trimmed
}

export const DISCORD_SHAPE = /^[0-9]{15,30}$/
