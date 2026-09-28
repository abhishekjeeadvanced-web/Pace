import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts } from "@/db/schema";
import { BUDGET_QUESTIONS, BUDGET_SECONDS, TOPICS, type Section } from "@/lib/types";

/* deterministic PRNG so the demo data is stable between restarts */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function localISO(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function buildPace(rng: () => number, seconds: number, skill: number) {
  // later questions get slower under clock pressure; skill flattens the ramp
  const raw: number[] = [];
  for (let i = 0; i < BUDGET_QUESTIONS; i++) {
    const ramp = 0.82 + (i / (BUDGET_QUESTIONS - 1)) * (0.55 - 0.22 * skill);
    raw.push(ramp * (0.78 + rng() * 0.5));
  }
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => Math.round((r / total) * seconds));
}

type Row = {
  day: string;
  section: Section;
  topic: string;
  questions: number;
  correct: number;
  wrong: number;
  skipped: number;
  seconds: number;
  pace: number[];
  note: string | null;
};

export async function ensureSeeded() {
  const [{ value }] = await db.select({ value: count() }).from(attempts);
  if (value > 0) return value;

  const rows: Row[] = [];
  const today = new Date();
  const rng = mulberry32(20260214);

  for (let back = 179; back >= 0; back--) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    const day = localISO(d);
    const dow = d.getDay();

    // rest days are rare; revision Sundays sometimes hold a single attempt
    const restChance = dow === 0 ? 0.32 : 0.09;
    if (rng() < restChance) continue;

    // skill climbs over the 6 months, with a plateau and exam-week jitters
    const progress = (179 - back) / 179;
    for (const section of ["maths", "reasoning"] as Section[]) {
      const sectionBias = section === "maths" ? -0.03 : 0.04;
      const base = 0.44 + progress * 0.36 + sectionBias;
      const attemptsToday = rng() < 0.34 ? 2 : 1;

      for (let n = 0; n < attemptsToday; n++) {
        const skill = clamp(base + (rng() - 0.5) * 0.13 - n * 0.035, 0.24, 0.95);
        const attempted = clamp(
          Math.round(BUDGET_QUESTIONS * (0.72 + skill * 0.32 + (rng() - 0.5) * 0.12)),
          14,
          BUDGET_QUESTIONS,
        );
        const accuracy = clamp(skill + (rng() - 0.5) * 0.16, 0.42, 0.98);
        const correct = Math.min(attempted, Math.round(attempted * accuracy));
        const wrong = attempted - correct;
        const skipped = BUDGET_QUESTIONS - attempted;

        // better performers get through the paper faster; some attempts hit the wall at 15:00
        const fastFactor = 1.22 - 0.44 * skill + (rng() - 0.5) * 0.12;
        const timedOut = rng() < 0.12 + (1 - progress) * 0.12;
        const seconds = timedOut
          ? BUDGET_SECONDS
          : Math.round(clamp(BUDGET_SECONDS * fastFactor, 620, 895));

        const topicPool = TOPICS[section];
        rows.push({
          day,
          section,
          topic: topicPool[Math.floor(rng() * topicPool.length)],
          questions: BUDGET_QUESTIONS,
          correct,
          wrong,
          skipped,
          seconds,
          pace: buildPace(rng, seconds, skill),
          note:
            rng() < 0.12
              ? [
                  "Silky attempt — 2 skips in Geometry.",
                  "Lost 90s on a single DI set.",
                  "Speed drill: skipped long calculations on purpose.",
                  "Best pace so far in this topic.",
                  "Rushed the last five; careless errors.",
                ][Math.floor(rng() * 5)]
              : null,
        });
      }
    }
  }

  for (let i = 0; i < rows.length; i += 60) {
    await db.insert(attempts).values(rows.slice(i, i + 60));
  }
  return rows.length;
}

export async function countByDay(day: string, section: Section) {
  const rows = await db
    .select({ value: count() })
    .from(attempts)
    .where(eq(attempts.day, day));
  return rows[0]?.value ?? 0;
}
