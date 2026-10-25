import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/pool.js";
import { questionBank, users, tournamentPlayers, tournaments } from "../src/db/schema/index.js";
const pub = await db.select({ tag: questionBank.tag, kind: questionBank.kind, n: sql<number>`count(*)` })
    .from(questionBank).where(eq(questionBank.status, "PUBLISHED"))
    .groupBy(questionBank.tag, questionBank.kind).orderBy(sql`count(*) desc`);
console.log("PUBLISHED by tag/kind (top 30):"); pub.slice(0,30).forEach(r => console.log(" ", r.tag, r.kind, String(r.n)));
const byKind = await db.select({ kind: questionBank.kind, n: sql<number>`count(*)` }).from(questionBank)
    .groupBy(questionBank.kind);
console.log("ALL rows by kind:", byKind.map(r=>`${r.kind}=${r.n}`).join(" "));
const byStatus = await db.select({ status: questionBank.status, n: sql<number>`count(*)` }).from(questionBank)
    .groupBy(questionBank.status);
console.log("ALL rows by status:", byStatus.map(r=>`${r.status}=${r.n}`).join(" "));
const [t] = await db.select().from(tournaments).where(eq(tournaments.slug,"demo-tournament-2026"));
const roster = await db.select({ id: users.id, username: users.username, name: users.displayName })
    .from(tournamentPlayers).innerJoin(users, eq(tournamentPlayers.userId, users.id))
    .where(eq(tournamentPlayers.tournamentId, t.id));
console.log("roster:", roster.length); roster.slice(0,4).forEach(r=>console.log(" ", r.username, "|", r.name));
