export const queryKeys = {
    enrolled: (tournamentId: string) => ["enrolled", tournamentId] as const,
}
