export interface Stage {
    id: string
    title: string
    start: string 
    end: string
}

export const OLYMPIA_STAGES: Stage[] = [
    { id: "qualifiers", title: "Vòng loại", start: "2025-06-01", end: "2025-06-10" },
    { id: "bracket", title: "Vòng phân nhánh", start: "2025-06-11", end: "2025-06-13" },
    { id: "playoffs", title: "Vòng Playoffs", start: "2025-06-14", end: "2025-06-15" },
    { id: "final", title: "Chung kết", start: "2025-06-16", end: "2025-06-20" },
]