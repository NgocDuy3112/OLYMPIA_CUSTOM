export const ROUND_IDS = ["khoi-dong", "giai-ma", "but-pha", "ve-dich"] as const

export type RoundId = (typeof ROUND_IDS)[number]

export interface RoundRegistry<Module> {
    of: (roundId: string) => Module | null
}

export function createRoundRegistry<Module>(modules: Record<RoundId, Module>): RoundRegistry<Module> {
    const of = (roundId: string): Module | null => {
        for (const id of ROUND_IDS) if (id === roundId) return modules[id]
        return null
    }
    return { of }
}
