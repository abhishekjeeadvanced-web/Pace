import { sql } from "drizzle-orm";
import { date, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One practice attempt of an SSC sectional test:
 * 25 questions inside a fixed 15:00 (900 second) window.
 */
export const attempts = pgTable(
  "attempts",
  {
    id: serial("id").primaryKey(),
    day: date("day", { mode: "string" }).notNull(),
    section: text("section").notNull(), // "maths" | "reasoning"
    topic: text("topic").notNull(),
    questions: integer("questions").notNull().default(25),
    correct: integer("correct").notNull(),
    wrong: integer("wrong").notNull(),
    skipped: integer("skipped").notNull(),
    seconds: integer("seconds").notNull(), // time actually used out of 900
    pace: jsonb("pace").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("attempts_day_idx").on(t.day), index("attempts_section_idx").on(t.section)],
);
