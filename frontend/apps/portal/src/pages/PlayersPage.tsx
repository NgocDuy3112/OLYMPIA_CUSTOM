import { Page, PageHeader } from "@/components/page"
import { PlayersDesk } from "@/components/players-desk"

export function PlayersPage() {
    return (
        <Page>
            <PageHeader title="Thí sinh" />
            <PlayersDesk />
        </Page>
    )
}
