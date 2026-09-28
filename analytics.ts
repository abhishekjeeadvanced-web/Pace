import { BUDGET_SECONDS, SECONDS_PER_QUESTION, type Attempt, type Section } from "@/lib/types";

export type Grain = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly";

export const GRAINS: { id: Grain; label: string; short: string }[] = [
  { id: "daily", label: "Daily", short: "D" },
  { id: "weekly", label: "Weekly", short: "W" },
  { id: "biweekly", label: "Biweekly", short: "2W" },
  { id: "monthly", label: "Monthly", short: "M" },
  { id: "quarterly", label: "Quarterly", short: "Q" },
];

export const PRESETS = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "15d", label: "15 days", days: 15 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "180d", label: "6 months", days: 180 },
  { id: "all", label: "All", days: 3650 },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"] | "custom";

/* ---------- date helpers ---------- */

export function isoDay(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function parseDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function shiftDay(day: string, days: number) {
  const d = parseDay(day);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDay(day: string, withYear = false) {
  const d = parseDay(day);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? " " + String(d.getFullYear()).slice(2) : ""}`;
}

/* ---------- bucketing ---------- */

export type Bucket = {
  key: string;
  label: string;
  start: string;
  end: string;
  attempts: Attempt[];
};

function bucketStart(day: string, grain: Grain) {
  const d = parseDay(day);
  if (grain === "daily") return isoDay(d);
  if (grain === "weekly" || grain === "biweekly") {
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - dow);
    if (grain === "biweekly") {
      const epoch = new Date(2024, 0, 1); // Monday
      const weeks = Math.round((d.getTime() - epoch.getTime()) / (7 * 864e5));
      const floored = Math.floor(weeks / 2) * 2;
      d.setTime(epoch.getTime() + floored * 7 * 864e5);
    }
    return isoDay(d);
  }
  if (grain === "monthly") {
    return isoDay(new Date(d.getFullYear(), d.getMonth(), 1));
  }
  return isoDay(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1));
}

function bucketLabel(start: string, grain: Grain) {
  const d = parseDay(start);
  if (grain === "daily") return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (grain === "weekly" || grain === "biweekly") return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (grain === "monthly") return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}`;
}

export function bucketize(rows: Attempt[], grain: Grain): Bucket[] {
  const map = new Map<string, Attempt[]>();
  for (const row of rows) {
    const key = bucketStart(row.day, grain);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, list]) => ({ key, label: bucketLabel(key, grain), start: key, end: list[list.length - 1].day, attempts: list }));
}

/* ---------- aggregations ---------- */

export type Agg = {
  attempts: number;
  accuracy: number; // 0..100
  avgSeconds: number;
  speed: number; // questions per minute
  correct: number;
  wrong: number;
  skipped: number;
  targetRate: number; // 0..100
  avgSecPerQ: number;
};

export function isTargetMet(a: Attempt) {
  const attempted = a.correct + a.wrong;
  return attempted >= 25 && a.correct / 25 >= 0.8 && a.seconds <= BUDGET_SECONDS;
}

export function aggregate(rows: Attempt[]): Agg {
  const n = rows.length || 1;
  let correct = 0,
    wrong = 0,
    skipped = 0,
    seconds = 0,
    attempted = 0,
    targets = 0;
  for (const r of rows) {
    correct += r.correct;
    wrong += r.wrong;
    skipped += r.skipped;
    seconds += r.seconds;
    attempted += r.correct + r.wrong;
    if (isTargetMet(r)) targets++;
  }
  const totalAnswers = correct + wrong || 1;
  return {
    attempts: rows.length,
    accuracy: (correct / totalAnswers) * 100,
    avgSeconds: seconds / n,
    speed: attempted / n / (seconds / n / 60),
    correct,
    wrong,
    skipped,
    targetRate: (targets / n) * 100,
    avgSecPerQ: seconds / n / 25,
  };
}

export type Kpi = {
  id: string;
  label: string;
  value: string;
  unit: string;
  delta: number; // % change vs previous window
  goodWhenUp: boolean;
  spark: number[];
  hint: string;
};

const fmt1 = (v: number) => v.toFixed(1);
const fmt0 = (v: number) => Math.round(v).toString();

function pctDelta(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

export function buildKpis(cur: Attempt[], prev: Attempt[], buckets: Bucket[]): Kpi[] {
  const a = aggregate(cur);
  const b = aggregate(prev.length ? prev : cur);
  const sparkOf = (pick: (agg: Agg) => number) => buckets.map((bk) => pick(aggregate(bk.attempts)));

  return [
    {
      id: "speed",
      label: "Avg speed",
      value: fmt1(a.speed),
      unit: "Q / min",
      delta: pctDelta(a.speed, b.speed),
      goodWhenUp: true,
      spark: sparkOf((x) => x.speed),
      hint: "Questions attempted per minute of the 15:00 window.",
    },
    {
      id: "accuracy",
      label: "Accuracy",
      value: fmt1(a.accuracy),
      unit: "%",
      delta: pctDelta(a.accuracy, b.accuracy),
      goodWhenUp: true,
      spark: sparkOf((x) => x.accuracy),
      hint: "Correct answers as a share of everything marked.",
    },
    {
      id: "time",
      label: "Time used",
      value: fmtTime(a.avgSeconds),
      unit: "of 15:00",
      delta: pctDelta(a.avgSeconds, b.avgSeconds),
      goodWhenUp: false,
      spark: sparkOf((x) => x.avgSeconds),
      hint: "Average clock used before the paper was put down.",
    },
    {
      id: "target",
      label: "Target hit rate",
      value: fmt0(a.targetRate),
      unit: "% of attempts",
      delta: pctDelta(a.targetRate, b.targetRate),
      goodWhenUp: true,
      spark: sparkOf((x) => x.targetRate),
      hint: "25 attempted with ≥80% accuracy inside the window.",
    },
    {
      id: "volume",
      label: "Attempts logged",
      value: fmt0(a.attempts),
      unit: "papers",
      delta: pctDelta(a.attempts, b.attempts),
      goodWhenUp: true,
      spark: sparkOf((x) => x.attempts),
      hint: "Full 25-question sectional papers in this range.",
    },
    {
      id: "consistency",
      label: "Consistency",
      value: fmt0(consistency(cur)),
      unit: "/ 100",
      delta: pctDelta(consistency(cur), consistency(prev.length ? prev : cur)),
      goodWhenUp: true,
      spark: sparkOf((x) => 100 - Math.min(100, Math.abs(x.avgSecPerQ - SECONDS_PER_QUESTION) * 4)),
      hint: "How tightly your pace holds near the 36s per question budget.",
    },
  ];
}

export function consistency(rows: Attempt[]) {
  if (!rows.length) return 0;
  const vals = rows.map((r) => (r.correct + r.wrong) / 25);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return Math.max(0, 100 - Math.sqrt(variance) * 220);
}

export function fmtTime(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function paceCurve(rows: Attempt[]) {
  const sums = new Array(25).fill(0);
  const counts = new Array(25).fill(0);
  for (const r of rows) {
    for (let i = 0; i < Math.min(25, r.pace.length); i++) {
      sums[i] += r.pace[i];
      counts[i]++;
    }
  }
  return sums.map((s, i) => (counts[i] ? s / counts[i] : SECONDS_PER_QUESTION));
}

export function sectionSplit(rows: Attempt[]) {
  const maths = rows.filter((r) => r.section === "maths");
  const reasoning = rows.filter((r) => r.section === "reasoning");
  return {
    maths: aggregate(maths),
    reasoning: aggregate(reasoning),
    mathsRows: maths,
    reasoningRows: reasoning,
  };
}

export function topicStats(rows: Attempt[]) {
  const map = new Map<string, { topic: string; section: Section; attempts: number; correct: number; wrong: number; seconds: number }>();
  for (const r of rows) {
    const key = `${r.section}::${r.topic}`;
    const entry = map.get(key) ?? { topic: r.topic, section: r.section, attempts: 0, correct: 0, wrong: 0, seconds: 0 };
    entry.attempts++;
    entry.correct += r.correct;
    entry.wrong += r.wrong;
    entry.seconds += r.seconds;
    map.set(key, entry);
  }
  return [...map.values()]
    .map((t) => ({
      ...t,
      accuracy: t.correct + t.wrong ? (t.correct / (t.correct + t.wrong)) * 100 : 0,
      secPerQ: t.seconds / t.attempts / 25,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
}
