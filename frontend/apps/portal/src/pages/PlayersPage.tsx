import { Page, PageHeader } from "@/components/page"
import { PlayersDesk } from "@/components/players-desk"

export function PlayersPage() {
    return (
        <Page>
            <PageHeader title="Thí sinh" description="Danh sách thí sinh có thể xếp vào một trận." />
            <PlayersDesk />
        </Page>
    )
}
