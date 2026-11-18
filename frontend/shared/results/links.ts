export function requiredEnv(name: string): string {
    const value = import.meta.env[name]
    if (!value) {
        throw new Error(`Thiếu ${name} — hãy cấu hình trong configs/.env`)
    }
    return value
}

export function gameplayMatchUrl(tournamentId: string, matchId: string): string {
    const base = requiredEnv("VITE_GAMEPLAY_BASE_URL")
    return `${base}/tournaments/${tournamentId}/matches/${matchId}`
}

export function authNextTarget(next: string): string {
    if (/\/matches\//.test(next)) {
        return `${requiredEnv("VITE_GAMEPLAY_BASE_URL")}${next}`
    }
    return next
}

export function openGameplayMatch(
    navigate: (to: string) => void,
    tournamentId: string,
    matchId: string,
): void {
    const target = gameplayMatchUrl(tournamentId, matchId)
    if (target.startsWith("http")) {
        window.open(target, "_blank")
        return
    }
    navigate(target)
}
