import { useState, type SubmitEvent } from "react"
import { Button } from "@shared/ui/button"
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@shared/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@shared/ui/field"
import { Input } from "@shared/ui/input"
import { useMe } from "@/lib/session"
import {
    PLACEMENT_SCALES,
    useUpdateTournament,
    type PlacementTier,
    type TournamentDetail,
    type TournamentUpdate
} from "@/lib/tournaments"

export function EditTournamentDialog({
    tournament,
    open,
    onOpenChange,
}: {
    tournament: TournamentDetail
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const { data: me } = useMe()
    const update = useUpdateTournament(tournament.id)
    const isAdmin = me?.role === "ADMIN"

    const [name, setName] = useState(tournament.name)
    const [slug, setSlug] = useState(tournament.slug)
    const [visibility, setVisibility] = useState(tournament.visibility)
    const [tags, setTags] = useState(tournament.defaultTags.join(", "))
    // The points for places are this tournament's own: no scale means no points.
    const [tiers, setTiers] = useState<PlacementTier[]>(tournament.defaultPlacementTiers ?? [])

    const submit = (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()

        const patch: TournamentUpdate = { name, slug }
        if (isAdmin) patch.visibility = visibility
        patch.defaultTags = tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        patch.defaultPlacementTiers = tiers

        update.mutate(patch, { onSuccess: () => onOpenChange(false) })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={submit} className="flex flex-col gap-6">
                    <DialogHeader>
                        <DialogTitle>Edit tournament</DialogTitle>
                        <DialogDescription>
                            Name and slug appear in public URLs; tags drive eligibility.
                        </DialogDescription>
                    </DialogHeader>

                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="tournament-name">Name</FieldLabel>
                            <Input
                                id="tournament-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                required
                            />
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="tournament-slug">Slug</FieldLabel>
                            <Input
                                id="tournament-slug"
                                value={slug}
                                onChange={(event) => setSlug(event.target.value)}
                                required
                            />
                            <FieldDescription>Used in public URLs. Must be unique.</FieldDescription>
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="tournament-visibility">Visibility</FieldLabel>
                            {isAdmin ? (
                                <select
                                    id="tournament-visibility"
                                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                                    value={visibility}
                                    onChange={(event) =>
                                        setVisibility(event.target.value as "PUBLIC" | "PRIVATE")
                                    }
                                >
                                    <option value="PUBLIC">Public</option>
                                    <option value="PRIVATE">Private</option>
                                </select>
                            ) : (
                                <FieldDescription>
                                    {tournament.visibility} — only an admin can change visibility.
                                </FieldDescription>
                            )}
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="tournament-points">Points for places</FieldLabel>
                            <div className="flex flex-col gap-2">
                                {tiers.map((tier, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">Place</span>
                                        <Input
                                            aria-label="From place"
                                            type="number"
                                            className="h-8 w-16"
                                            value={tier.min}
                                            onChange={(event) =>
                                                setTiers((current) =>
                                                    current.map((row, i) =>
                                                        i === index
                                                            ? { ...row, min: Number(event.target.value) }
                                                            : row
                                                    )
                                                )
                                            }
                                        />
                                        <span className="text-xs text-muted-foreground">to</span>
                                        <Input
                                            aria-label="To place"
                                            type="number"
                                            className="h-8 w-16"
                                            value={tier.max}
                                            onChange={(event) =>
                                                setTiers((current) =>
                                                    current.map((row, i) =>
                                                        i === index
                                                            ? { ...row, max: Number(event.target.value) }
                                                            : row
                                                    )
                                                )
                                            }
                                        />
                                        <span className="text-xs text-muted-foreground">points</span>
                                        <Input
                                            aria-label="Points"
                                            type="number"
                                            className="h-8 w-16"
                                            value={tier.points}
                                            onChange={(event) =>
                                                setTiers((current) =>
                                                    current.map((row, i) =>
                                                        i === index
                                                            ? { ...row, points: Number(event.target.value) }
                                                            : row
                                                    )
                                                )
                                            }
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                                setTiers((current) => current.filter((_, i) => i !== index))
                                            }
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                ))}
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                            setTiers((current) => [
                                                ...current,
                                                { min: 1, max: 1, points: 0 }
                                            ])
                                        }
                                    >
                                        Add a band
                                    </Button>
                                    {PLACEMENT_SCALES.map((scale) => (
                                        <Button
                                            key={scale.id}
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setTiers(scale.tiers.map((tier) => ({ ...tier })))}
                                        >
                                            Use {scale.title}
                                        </Button>
                                    ))}
                                    {tiers.length > 0 && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setTiers([])}
                                        >
                                            No points
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <FieldDescription>
                                What each place of the season is worth. A tournament without a
                                scale awards no points for places.
                            </FieldDescription>
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="tournament-tags">Tags</FieldLabel>
                            <Input
                                id="tournament-tags"
                                value={tags}
                                onChange={(event) => setTags(event.target.value)}
                                placeholder="THTH, GDTT"
                            />
                            <FieldDescription>Comma-separated. At least one is required.</FieldDescription>
                        </Field>
                    </FieldGroup>

                    {update.isError && (
                        <p className="text-sm text-destructive">{update.error.message}</p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={update.isPending}>
                            {update.isPending ? "Saving…" : "Save changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}