import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Bộ đề (question sets) — preset câu hỏi theo trận, pick từ bank.
 * 1 bộ thuộc đúng 1 matchCode. Pick là tham chiếu bankCode (không khoá bank,
 * cùng câu bank xài chung nhiều bộ được). Kích hoạt = copy nội dung vào
 * bảng questions của trận (code live giữ nguyên).
 */
export const questionSets = pgTable(
  "question_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Mã bộ tự sinh: BD_<BASE36 time>. Tên hiển thị do QAuthor đặt.
    setCode: varchar("set_code", { length: 30 }).notNull().unique(),
    setName: varchar("set_name", { length: 100 }).notNull(),
    matchCode: varchar("match_code", { length: 25 }),
    // draft: đang soạn (sửa/xoá tự do) | ready: đủ slot, chờ kích hoạt.
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    // Mã trận đang dùng bộ này (set lúc activate, clear ở các bộ cùng trận).
    activeMatchCode: varchar("active_match_code", { length: 25 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_qsets_match_code").on(t.matchCode),
    index("idx_qsets_status").on(t.status),
    index("idx_qsets_active_match").on(t.activeMatchCode),
  ],
);

/** Dòng trong bộ đề: 1 slot = 1 bankCode (GM fill nguyên set 9 dòng). */
export const questionSetItems = pgTable(
  "question_set_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    setId: uuid("set_id")
      .notNull()
      .references(() => questionSets.id, { onDelete: "cascade" }),
    // KD_C | KD_R | GM | BP | VD.
    round: varchar("round", { length: 10 }).notNull(),
    // KDC_1..6 | KDR{1..4}_1..6 | GM_KEY/GM_H1..H8 | BP_1..4 |
    // VD_<DOMAIN>_<20|30|40|50>.
    slot: varchar("slot", { length: 25 }).notNull(),
    bankCode: varchar("bank_code", { length: 25 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_qset_items_set_id").on(t.setId),
    uniqueIndex("uq_qset_items_set_slot")
      .on(t.setId, t.slot)
      .where(sql`${t.slot} IS NOT NULL`),
  ],
);
