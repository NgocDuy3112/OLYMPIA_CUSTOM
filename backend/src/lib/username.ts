import { randomInt } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/pool.js";
import { users } from "../db/schema/index.js";

const MAX_HANDLE = 45;

export function slugifyUsername(raw: string): string {
    const ascii = raw
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/đ/g, "d");
    const slug = ascii
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX_HANDLE)
        .replace(/-+$/g, "");
    return slug.length > 0 ? slug : "player";
}

export async function pickUsername(
    executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
    displayName: string
): Promise<string> {
    const base = slugifyUsername(displayName);

    for (let n = 1; n <= 50; n += 1) {
        const candidate = n === 1 ? base : `${base}-${n}`;
        const [taken] = await executor
            .select({ id: users.id })
            .from(users)
            .where(sql`lower(${users.username}) = ${candidate}`)
            .limit(1);
        if (!taken) return candidate;
    }

    return `${base}-${randomInt(100, 1000)}`;
}
