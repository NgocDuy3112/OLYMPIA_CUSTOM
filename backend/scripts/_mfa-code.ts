import { generateSync } from "otplib";
import { db } from "../src/db/pool.js";
import { users } from "../src/db/schema/index.js";
import { eq } from "drizzle-orm";
const [a] = await db.select().from(users).where(eq(users.role, "ADMIN")).limit(1);
console.log("code=" + generateSync({ secret: a.totpSecret! }));
await db.$client.end();
