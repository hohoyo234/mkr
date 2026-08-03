import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const activityRecords = sqliteTable("activity_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  zone: text("zone").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  amountCents: integer("amount_cents"),
  createdAt: integer("created_at").notNull(),
});
