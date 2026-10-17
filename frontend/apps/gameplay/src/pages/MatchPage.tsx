import { useNavigate, useParams } from "react-router-dom"
import { MatchDetail } from "@/components/schedule/MatchDetail"
import { NotFoundPage } from "@/pages/NotFoundPage"
import type { Match } from "@/data/schedule"

interface MatchPageProps {
    matches: Match[]
}

export function MatchPage({ matches }: MatchPageProps) {
    const { id } = useParams()
    const navigate = useNavigate()
    const match = matches.find((m) => m.id === id)

    if (!match) {
        return <NotFoundPage />
    }

    return (
        <MatchDetail
            match={match}
            onBack={() => navigate("/")}
        />
    )
}