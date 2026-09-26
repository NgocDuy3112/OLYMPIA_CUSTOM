import { and, eq } from "@oc/db";
import { db, users } from "@oc/db";

export type UserRow = typeof users.$inferSelect;

export interface UserCreateInput {
  email: string;
  userCode: string;
  userName: string;
  role?: UserRow["role"];
  googleId?: string | null;
  avatarUrl?: string | null;
  passwordHash?: string | null;
  operatorScopes?: string | null;
}

export type UserUpdateInput = Partial<
  Pick<
    UserRow,
    "email" | "userName" | "role" | "avatarUrl" | "operatorScopes" | "googleId" | "passwordHash"
  >
>;

export interface UserRepo {
  list(): Promise<UserRow[]>;
  findById(id: string): Promise<UserRow | null>;
  findByCode(userCode: string): Promise<UserRow | null>;
  findByEmail(email: string): Promise<UserRow | null>;
  create(input: UserCreateInput): Promise<UserRow>;
  updateById(id: string, updates: UserUpdateInput): Promise<{ id: string } | null>;
  updateByCode(userCode: string, updates: UserUpdateInput): Promise<{ id: string } | null>;
  updateGoogleInfo(
    userId: string,
    info: { googleId: string; avatarUrl?: string | null },
  ): Promise<void>;
  softDeleteByCode(userCode: string): Promise<{ id: string } | null>;
  grantOperator(
    userCode: string,
    scopes: string[],
  ): Promise<{ id: string; scopes: string[] } | null>;
}

export const drizzleUserRepo: UserRepo = {
  async list(): Promise<UserRow[]> {
    return db.select().from(users).where(eq(users.isDeleted, false));
  },

  async findById(id: string): Promise<UserRow | null> {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.isDeleted, false)))
      .limit(1);
    return rows[0] ?? null;
  },

  async findByCode(userCode: string): Promise<UserRow | null> {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
      .limit(1);
    return rows[0] ?? null;
  },

  async findByEmail(email: string): Promise<UserRow | null> {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return rows[0] ?? null;
  },

  async create(input: UserCreateInput): Promise<UserRow> {
    const inserted = await db
      .insert(users)
      .values({
        email: input.email,
        userCode: input.userCode,
        userName: input.userName,
        role: input.role ?? "player",
        googleId: input.googleId ?? null,
        avatarUrl: input.avatarUrl ?? null,
        passwordHash: input.passwordHash ?? null,
        operatorScopes: input.operatorScopes ?? null,
      })
      .returning();
    return inserted[0];
  },

  async updateById(
    id: string,
    updates: UserUpdateInput,
  ): Promise<{ id: string } | null> {
    const result = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.isDeleted, false)))
      .returning({ id: users.id });
    return result[0] ?? null;
  },

  async updateByCode(
    userCode: string,
    updates: UserUpdateInput,
  ): Promise<{ id: string } | null> {
    const result = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
      .returning({ id: users.id });
    return result[0] ?? null;
  },

  async updateGoogleInfo(
    userId: string,
    info: { googleId: string; avatarUrl?: string | null },
  ): Promise<void> {
    await db
      .update(users)
      .set({
        googleId: info.googleId,
        avatarUrl: info.avatarUrl ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  },

  async softDeleteByCode(userCode: string): Promise<{ id: string } | null> {
    const result = await db
      .update(users)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
      .returning({ id: users.id });
    return result[0] ?? null;
  },

  async grantOperator(
    userCode: string,
    scopes: string[],
  ): Promise<{ id: string; scopes: string[] } | null> {
    const unique = [...new Set(scopes)].sort();
    const result = await db
      .update(users)
      .set({
        role: "operator",
        operatorScopes: unique.join(","),
        updatedAt: new Date(),
      })
      .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
      .returning({ id: users.id });
    if (result.length === 0) return null;
    return { id: result[0].id, scopes: unique };
  },
};

export function createInMemoryUserRepo(
  seed: UserRow[] = [],
): UserRepo & { rows: UserRow[] } {
  const rows: UserRow[] = [...seed];
  const alive = (r: UserRow) => !r.isDeleted;

  return {
    rows,

    async list() {
      return rows.filter(alive).map((r) => ({ ...r }));
    },

    async findById(id) {
      return rows.find((r) => r.id === id && alive(r)) ?? null;
    },

    async findByCode(userCode) {
      return rows.find((r) => r.userCode === userCode && alive(r)) ?? null;
    },

    async findByEmail(email) {
      return rows.find((r) => r.email === email) ?? null;
    },

    async create(input) {
      const now = new Date();
      const row: UserRow = {
        id: `mem-${rows.length + 1}`,
        userSlug: `slug-${rows.length + 1}`,
        googleId: input.googleId ?? null,
        passwordHash: input.passwordHash ?? null,
        email: input.email,
        userCode: input.userCode,
        userName: input.userName,
        avatarUrl: input.avatarUrl ?? null,
        role: input.role ?? "player",
        operatorScopes: input.operatorScopes ?? null,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(row);
      return { ...row };
    },

    async updateById(id, updates) {
      const row = rows.find((r) => r.id === id && alive(r));
      if (!row) return null;
      Object.assign(row, updates, { updatedAt: new Date() });
      return { id: row.id };
    },

    async updateByCode(userCode, updates) {
      const row = rows.find((r) => r.userCode === userCode && alive(r));
      if (!row) return null;
      Object.assign(row, updates, { updatedAt: new Date() });
      return { id: row.id };
    },

    async updateGoogleInfo(userId, info) {
      const row = rows.find((r) => r.id === userId);
      if (!row) return;
      row.googleId = info.googleId;
      row.avatarUrl = info.avatarUrl ?? null;
      row.updatedAt = new Date();
    },

    async softDeleteByCode(userCode) {
      const row = rows.find((r) => r.userCode === userCode && alive(r));
      if (!row) return null;
      row.isDeleted = true;
      row.updatedAt = new Date();
      return { id: row.id };
    },

    async grantOperator(userCode, scopes) {
      const row = rows.find((r) => r.userCode === userCode && alive(r));
      if (!row) return null;
      const unique = [...new Set(scopes)].sort();
      row.role = "operator";
      row.operatorScopes = unique.join(",");
      row.updatedAt = new Date();
      return { id: row.id, scopes: unique };
    },
  };
}
