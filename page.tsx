import { asc } from "drizzle-orm";
import { Dashboard } from "@/components/dashboard";
import { db } from "@/db";
import { attempts } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import type { Attempt, Section } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureSeeded();
  const rows = await db
    .select()
    .from(attempts)
    .orderBy(asc(attempts.day), asc(attempts.id))
    .limit(4000);

  const initialAttempts: Attempt[] = rows.map((r) => ({
    id: r.id,
    day: r.day,
    section: r.section as Section,
    topic: r.topic,
    questions: r.questions,
    correct: r.correct,
    wrong: r.wrong,
    skipped: r.skipped,
    seconds: r.seconds,
    pace: Array.isArray(r.pace) ? r.pace : [],
    note: r.note,
  }));

  return <Dashboard initialAttempts={initialAttempts} />;
}
