import { eq } from "drizzle-orm";
import { db } from "../src/db/pool.js";
import { users } from "../src/db/schema/index.js";
import { createMcpKey } from "../src/modules/mcp-keys/service.js";

const label = process.argv[2] ?? "claude-code";

const [user] = await db.select().from(users).where(eq(users.role, "ADMIN")).limit(1);
if (!user) throw new Error("No ADMIN user found — seed one first (npm run seed:admin)");

const issued = await createMcpKey(user.id, { label });

console.log("\nToken (shown exactly once — copy it now):\n");
console.log(issued.token);
console.log(`\nkey id: ${issued.key.id}`);
console.log(`scopes: ${issued.key.scopes.join(", ")}`);
console.log(`owner:  ${user.username} (${user.id})\n`);

await db.$client.end();