import { eq } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { tournaments } from "../../db/schema/index.js";
import { TournamentError } from "./errors.js";
import { CreateTournamentInput, UpdateTournamentInput, validate } from "./schemas.js";


function assertUniqueTags(tags: string[]): void {
    if (new Set(tags).size !== tags.length) {
        throw new TournamentError("VALIDATION", "defaultTags contains duplicates");
    }
}

function isSlugConflict(error: unknown): boolean {
    const e = error as { code?: string; constraint?: string };
    return e.code === "23505" && e.constraint === "tournaments_slug_unique";
}


export async function createTournament(
    input: CreateTournamentInput,
    ownerId: string
): Promise<typeof tournaments.$inferSelect> {
    validate(CreateTournamentInput, input);
    assertUniqueTags(input.defaultTags);

    try {
        const [row] = await db
            .insert(tournaments)
            .values({
                name: input.name,
                slug: input.slug,
                visibility: input.visibility,          // undefined → DB default 'PUBLIC'
                ownerId,
                defaultTags: input.defaultTags,
                defaultRounds: input.defaultRounds,
                defaultFormat: input.defaultFormat,
                defaultPlacementTiers: input.defaultPlacementTiers
            })
            .returning();
        return row;
    } catch (error) {
        if (isSlugConflict(error)) {
            throw new TournamentError("SLUG_TAKEN", `slug "${input.slug}" is already taken`);
        }
        throw error;
    }
}



export async function updateTournament(
    id: string,
    patch: UpdateTournamentInput
): Promise<typeof tournaments.$inferSelect> {
    validate(UpdateTournamentInput, patch);

    if (patch.defaultTags) assertUniqueTags(patch.defaultTags);

    const before = await getTournament(id);           // throws NOT_FOUND

    try {
        const [row] = await db
            .update(tournaments)
            .set({ ...patch, updatedAt: new Date() })
            .where(eq(tournaments.id, id))
            .returning();
        return row;
    } catch (error) {
        if (isSlugConflict(error)) {
            throw new TournamentError("SLUG_TAKEN", `slug "${patch.slug}" is already taken`);
        }
        throw error;
    }
}


export async function getTournament(id: string): Promise<typeof tournaments.$inferSelect> {
    const [row] = await db.select().from(tournaments).where(eq(tournaments.id, id)).limit(1);
    if (!row) throw new TournamentError("NOT_FOUND", `tournament ${id} not found`);
    return row;
}


export async function getBySlug(slug: string): Promise<typeof tournaments.$inferSelect> {
    const [row] = await db.select().from(tournaments).where(eq(tournaments.slug, slug)).limit(1);
    if (!row) throw new TournamentError("NOT_FOUND", `tournament "${slug}" not found`);
    return row;
}