import { Page, PageHeader } from "@/components/page"
import { PlayersDesk } from "@/components/players-desk"

/** Top-level roster desk (ADMIN + OPERATOR): every player account in one
 *  table — the read-only Thí sinh tab inside a tournament stays per tournament. */
export function PlayersPage() {
    return (
        <Page>
            <PageHeader title="Thí sinh" />
            <PlayersDesk />
        </Page>
    )
}
