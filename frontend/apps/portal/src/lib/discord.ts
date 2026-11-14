/** Discord hands out several shapes — a raw id, a mention or a profile link.
 *  Admins paste whichever they have, so normalise to the bare snowflake. */
export function discordValue(raw: string): string {
    const trimmed = raw.trim()
    if (trimmed === "" || DISCORD_SHAPE.test(trimmed)) return trimmed
    const extracted = trimmed.match(/(?:users\/|<@)([0-9]{15,30})>?/)
    return extracted ? extracted[1] : trimmed
}

export const DISCORD_SHAPE = /^[0-9]{15,30}$/
