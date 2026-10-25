// One-off survey (L4 setup): what does demo-tournament-2026 actually contain —
// rules, rounds, bank depth, roster. Read-only. Run:
//   npx tsx --env-file=../configs/.env scripts/_survey.ts
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db/pool.js";
import { matches, questionBank, tournamentPlayers, tournaments, users } from "../src/db/schema/index.js";

const [t] = await db.select().from(tournaments).where(eq(tournaments.slug, "demo-tournament-2026"));
if (!t) throw new Error("no demo-tournament-2026");
console.log("tournament:", t.id, "| tags:", t.tags, "| closedAt:", t.closedAt);
console.log("rounds:", JSON.stringify(t.rounds));
console.log("roundRules:", JSON.stringify(t.roundRules, null, 1));
console.log("stages:", JSON.stringify(t.stages));

const ms = await db.select().from(matches).where(eq(matches.tournamentId, t.id));
const standard = ms.filter((m) => m.kind === "STANDARD");
const sample = standard[0];
console.log("\nmatch", sample.id, "status", sample.status, "stage", sample.stageId, "slot", sample.slot);
console.log("match roundConfigs:", JSON.stringify(sample.roundConfigs, null, 1));
const dist: Record<string, number> = {};
for (const q of sample.questions as Array<{ roundId: string; turnId: string; kind: string }>) {
    const k = `${q.roundId}/${q.turnId}/${q.kind}`;
    dist[k] = (dist[k] ?? 0) + 1;
}
console.log("frozen question distribution:", dist);

const bank = await db
    .select({ kind: questionBank.kind, n: sql<number>`count(*)` })
    .from(questionBank)
    .where(and(eq(questionBank.status, "PUBLISHED"), inArray(questionBank.tag, t.tags)))
    .groupBy(questionBank.kind);
console.log("\nPUBLISHED bank by kind (tags", t.tags, "):", bank);

const roster = await db
    .select({ id: users.id, username: users.username, name: users.displayName, role: users.role })
    .from(tournamentPlayers)
    .innerJoin(users, eq(tournamentPlayers.userId, users.id))
    .where(eq(tournamentPlayers.tournamentId, t.id));
console.log("\nroster (" + roster.length + "):", roster.slice(0, 20));
