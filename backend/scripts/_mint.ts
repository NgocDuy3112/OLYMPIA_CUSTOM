import { buildApp } from "../src/app.js";
import { db } from "../src/db/pool.js";
import { users } from "../src/db/schema/index.js";
import { signToken } from "../src/lib/jwt.js";
import { eq } from "drizzle-orm";

const app = await buildApp();
await app.ready();
const [who] = await db.select().from(users).where(eq(users.role, "ADMIN")).limit(1);
const token = signToken(app, "PORTAL", { sub: who.id, role: who.role, tokenVersion: who.tokenVersion });
console.log(JSON.stringify({ id: who.id, role: who.role, token }));
await app.close();
await db.$client.end();
