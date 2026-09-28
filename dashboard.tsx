"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Donut,
  GroupedBars,
  LineChart,
  PaceRibbon,
  Sparkline,
  type BarSeries,
  type LineSeries,
} from "@/components/charts";
import { AttemptsTable } from "@/components/attempts-table";
import { LogForm } from "@/components/log-form";
import { Mark } from "@/components/mark";
import { InstallButton, RegisterServiceWorker, ThemeToggle } from "@/components/pwa";
import {
  aggregate,
  buildKpis,
  bucketize,
  fmtTime,
  formatDay,
  isoDay,
  paceCurve,
  PRESETS,
  shiftDay,
  topicStats,
  GRAINS,
  type Grain,
  type Kpi,
  type PresetId,
} from "@/lib/analytics";
import { SECTION_SHORT, SECONDS_PER_QUESTION, TOPICS, type Attempt, type Section } from "@/lib/types";

type Segment = "all" | Section;

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "all", label: "Both sections" },
  { id: "maths", label: "Maths" },
  { id: "reasoning", label: "Reasoning" },
];

function useCountUp(target: number, duration = 750) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function AnimatedValue({ text }: { text: string }) {
  const isTime = /^\d+:\d{2}$/.test(text);
  const numeric = isTime
    ? Number(text.split(":")[0]) * 60 + Number(text.split(":")[1])
    : Number.parseFloat(text);
  const animated = useCountUp(Number.isFinite(numeric) ? numeric : 0);
  const decimals = !isTime && text.includes(".") ? 1 : 0;
  const display = isTime
    ? `${Math.floor(animated / 60)}:${String(Math.round(animated % 60)).padStart(2, "0")}`
    : animated.toFixed(decimals);
  return <span className="tnum">{display}</span>;
}

function Trend({ delta, goodWhenUp }: { delta: number; goodWhenUp: boolean }) {
  const up = delta >= 0;
  const good = up === goodWhenUp;
  const color = Math.abs(delta) < 0.05 ? "var(--muted)" : good ? "var(--moss)" : "var(--vermilion)";
  return (
    <span className="tnum inline-flex items-center gap-1 font-mono text-[11px]" style={{ color }}>
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: up ? "none" : "rotate(180deg)" }}>
        <path d="M5 1L9 8H1z" fill="currentColor" />
      </svg>
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function chip(active: boolean) {
  return [
    "btn whitespace-nowrap",
    active
      ? "border-[var(--indigo)] bg-[var(--indigo)] text-[#fffdf7]"
      : "border-[var(--rule)] bg-transparent text-[var(--muted)] hover:bg-[var(--hover-fill)] hover:text-[var(--ink)]",
  ].join(" ");
}

export function Dashboard({ initialAttempts }: { initialAttempts: Attempt[] }) {
  const [rows, setRows] = useState<Attempt[]>(initialAttempts);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preset, setPreset] = useState<PresetId>("90d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [grain, setGrain] = useState<Grain>("weekly");

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/attempts", { cache: "no-store" });
      const json = await res.json();
      const list = (json.attempts ?? []) as Attempt[];
      list.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.id - b.id));
      setRows(list);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = useMemo(() => isoDay(new Date()), []);

  const range = useMemo(() => {
    if (preset === "all") {
      const days = rows.map((r) => r.day).sort();
      return { from: days[0] ?? shiftDay(today, -89), to: days[days.length - 1] ?? today };
    }
    if (preset === "custom") {
      return { from: customFrom || shiftDay(today, -29), to: customTo || today };
    }
    const span = PRESETS.find((p) => p.id === preset)?.days ?? 90;
    return { from: shiftDay(today, -(span - 1)), to: today };
  }, [preset, customFrom, customTo, rows, today]);

  const prevRange = useMemo(() => {
    const start = new Date(range.from + "T00:00:00");
    const end = new Date(range.to + "T00:00:00");
    const span = Math.max(1, Math.round((end.getTime() - start.getTime()) / 864e5) + 1);
    return { from: shiftDay(range.from, -span), to: shiftDay(range.from, -1) };
  }, [range]);

  const inSegment = useCallback(
    (r: Attempt) => segment === "all" || r.section === segment,
    [segment],
  );

  const filtered = useMemo(
    () => rows.filter((r) => inSegment(r) && r.day >= range.from && r.day <= range.to),
    [rows, inSegment, range],
  );

  const previous = useMemo(
    () => rows.filter((r) => inSegment(r) && r.day >= prevRange.from && r.day <= prevRange.to),
    [rows, inSegment, prevRange],
  );

  const buckets = useMemo(() => bucketize(filtered, grain), [filtered, grain]);
  const agg = useMemo(() => aggregate(filtered), [filtered]);
  const kpis = useMemo(() => buildKpis(filtered, previous, buckets), [filtered, previous, buckets]);
  const pace = useMemo(() => paceCurve(filtered), [filtered]);
  const topics = useMemo(() => topicStats(filtered).slice(0, 6), [filtered]);

  const labels = buckets.map((b) => b.label);
  const lineSeries: LineSeries[] = [
    {
      name: "Accuracy",
      color: "var(--indigo)",
      values: buckets.map((b) => aggregate(b.attempts).accuracy),
      format: (v) => `${v.toFixed(1)}%`,
      area: true,
    },
    {
      name: "Seconds / question",
      color: "var(--vermilion)",
      values: buckets.map((b) => aggregate(b.attempts).avgSecPerQ),
      format: (v) => `${v.toFixed(1)}s`,
      dashed: true,
    },
  ];

  const barSeries: BarSeries[] = [
    {
      name: "Maths correct",
      color: "var(--indigo)",
      values: buckets.map((b) => {
        const m = b.attempts.filter((r) => r.section === "maths");
        return m.length ? m.reduce((s, r) => s + r.correct, 0) / m.length : 0;
      }),
    },
    {
      name: "Reasoning correct",
      color: "var(--vermilion)",
      values: buckets.map((b) => {
        const m = b.attempts.filter((r) => r.section === "reasoning");
        return m.length ? m.reduce((s, r) => s + r.correct, 0) / m.length : 0;
      }),
    },
  ];

  const rollups = useMemo(() => {
    const out = {} as Record<
      Grain,
      {
        speed: number;
        accuracy: number;
        avgSeconds: number;
        attempts: number;
        trend: number;
        spark: number[];
        period: string;
      }
    >;
    for (const g of GRAINS) {
      const periods = bucketize(filtered, g.id);
      const per = periods.map((b) => aggregate(b.attempts));
      const last = per[per.length - 1] ?? aggregate(filtered);
      const prev = per[per.length - 2];
      const trend = prev?.speed ? ((last.speed - prev.speed) / prev.speed) * 100 : 0;
      out[g.id] = {
        speed: last.speed,
        accuracy: last.accuracy,
        avgSeconds: last.avgSeconds,
        attempts: last.attempts,
        trend,
        spark: per.map((a) => a.speed),
        period: periods[periods.length - 1]?.label ?? "—",
      };
    }
    return out;
  }, [filtered]);

  const slowest = pace.reduce((best, v, i) => (v > pace[best] ? i : best), 0);
  const overBudget = pace.filter((v) => v > SECONDS_PER_QUESTION).length;
  const hasData = filtered.length > 0;

  return (
    <div className="relative z-10 min-h-screen">
      <RegisterServiceWorker />

      {/* ------------------------------- header ------------------------------- */}
      <header className="relative isolate overflow-hidden border-b border-[var(--rule)]">
        <div className="absolute inset-0 -z-10">
          <img
            src="images/desk.jpg"
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover object-[68%_45%] opacity-[0.34] dark:opacity-[0.22]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(97deg,var(--paper)_16%,rgba(246,241,231,0.86)_46%,rgba(246,241,231,0.18)_100%)] dark:bg-[linear-gradient(97deg,#14161c_16%,rgba(20,22,28,0.88)_46%,rgba(20,22,28,0.32)_100%)]" />
        </div>

        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 pb-6 pt-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Mark size={46} />
            <div>
              <p className="font-display text-[19px] leading-none tracking-[-0.02em]">Pace Register</p>
              <p className="micro-label mt-1.5 text-[var(--muted)]">SSC sectional timing</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <InstallButton />
            <ThemeToggle />
          </div>
        </div>

        <div className="mx-auto max-w-[1440px] px-5 pb-12 lg:px-8">
          <p className="micro-label text-[var(--vermilion)]">25 questions / 15:00 window</p>
          <h1 className="mt-4 max-w-[16ch] font-display text-[clamp(2.55rem,7vw,5.15rem)] font-extrabold leading-[0.92] tracking-[-0.035em]">
            Speed is a <span className="text-[var(--indigo)]">measured</span>{" "}
            <span className="text-[var(--vermilion)]">habit.</span>
          </h1>
          <p className="mt-6 max-w-[54ch] text-[15px] leading-[1.65] text-[var(--muted)]">
            Log every sectional — Quantitative Aptitude and General Intelligence — and watch the clock
            question by question. Daily, weekly, biweekly, monthly and quarterly views keep the trend honest
            right up to exam day.
          </p>
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
            {[
              { k: "Attempts in register", v: String(rows.length) },
              { k: "Sections", v: "Maths + Reasoning" },
              { k: "Pace budget", v: "36s / question" },
              { k: "Target", v: "25 done, 80%+ accuracy" },
            ].map((item) => (
              <div key={item.k}>
                <dt className="micro-label text-[var(--muted)]">{item.k}</dt>
                <dd className="tnum mt-1.5 font-display text-[1.35rem] leading-none">{item.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {/* ----------------------------- filter bar ----------------------------- */}
      <div className="sticky top-0 z-40 border-b border-[var(--rule)] bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 lg:px-8">
          <div className="scroll-thin flex items-center gap-1.5 overflow-x-auto">
            <span className="micro-label mr-1 shrink-0 text-[var(--muted)]">Window</span>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`${chip(preset === p.id)} px-3 py-1.5 text-[11px]`}
                onClick={() => {
                  setPreset(p.id);
                  setGrain(p.days <= 15 ? "daily" : p.days <= 90 ? "weekly" : p.days <= 365 ? "monthly" : "quarterly");
                }}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={`${chip(preset === "custom")} px-3 py-1.5 text-[11px]`}
              onClick={() => setPreset("custom")}
            >
              Custom
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="From date"
              className="field py-1.5"
              value={customFrom || range.from}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                setPreset("custom");
              }}
            />
            <span className="text-[var(--muted)]">→</span>
            <input
              type="date"
              aria-label="To date"
              className="field py-1.5"
              value={customTo || range.to}
              onChange={(e) => {
                setCustomTo(e.target.value);
                setPreset("custom");
              }}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="micro-label mr-1 text-[var(--muted)]">Segment</span>
            {SEGMENTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${chip(segment === s.id)} px-3 py-1.5 text-[11px]`}
                onClick={() => setSegment(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="micro-label mr-1 text-[var(--muted)]">Grain</span>
            {GRAINS.map((g) => (
              <button
                key={g.id}
                type="button"
                title={g.label}
                className={`${chip(grain === g.id)} px-2.5 py-1.5 text-[11px]`}
                onClick={() => setGrain(g.id)}
              >
                {g.short}
              </button>
            ))}
          </div>

          <a href="#log" className="btn btn-primary ml-auto px-4 py-1.5">
            Log attempt
          </a>
        </div>
      </div>

      {loading ? (
        <div className="mx-auto max-w-[1440px] px-5 py-24 lg:px-8">
          <p className="micro-label text-[var(--muted)]">Reading the register…</p>
          <div className="mt-6 h-px w-full bg-[var(--rule)]" />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-[3px] bg-[var(--panel-2)]" />
            ))}
          </div>
        </div>
      ) : failed ? (
        <div className="mx-auto max-w-[1440px] px-5 py-24 text-center lg:px-8">
          <h2 className="font-display text-3xl">The register did not open</h2>
          <p className="mt-3 text-[13px] text-[var(--muted)]">The database could not be reached. Try again in a moment.</p>
          <button type="button" className="btn btn-primary mt-6" onClick={load}>
            Retry
          </button>
        </div>
      ) : !hasData ? (
        <div className="mx-auto max-w-[1440px] px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-[560px] rounded-[3px] border border-dashed border-[var(--rule)] bg-[var(--panel)] p-12 text-center">
            <p className="micro-label text-[var(--vermilion)]">Empty window</p>
            <h2 className="mt-3 font-display text-[2rem] leading-tight">No attempts in this range</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              Widen the window, switch the segment back to both sections, or log the paper you just finished.
            </p>
            <div className="mt-6 flex justify-center gap-2.5">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setPreset("all");
                  setSegment("all");
                }}
              >
                Show everything
              </button>
              <a href="#log" className="btn btn-primary">
                Log attempt
              </a>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* --------------------------- pace ribbon --------------------------- */}
          <section id="pace" className="border-b border-[var(--rule)] bg-[var(--panel-2)]">
            <div className="mx-auto max-w-[1440px] px-5 py-11 lg:px-8">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="max-w-[52ch]">
                  <p className="micro-label text-[var(--vermilion)]">The 15:00 pace ribbon</p>
                  <h2 className="mt-3 font-display text-[clamp(1.9rem,3.6vw,2.9rem)] leading-[1.02] tracking-[-0.025em]">
                    Where the fifteen minutes actually go.
                  </h2>
                  <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--muted)]">
                    Average seconds spent on each question across{" "}
                    <span className="text-[var(--ink)]">{filtered.length} attempts</span> in this window. Anything
                    above the dashed line is time borrowed from the questions still waiting.
                  </p>
                </div>
                <dl className="flex flex-wrap gap-x-9 gap-y-4">
                  {[
                    { k: "Your avg / Q", v: `${agg.avgSecPerQ.toFixed(1)}s`, tone: agg.avgSecPerQ > 36 ? "var(--vermilion)" : "var(--moss)" },
                    { k: "Slowest question", v: `Q${slowest + 1} · ${pace[slowest].toFixed(1)}s`, tone: "var(--ink)" },
                    { k: "Over budget", v: `${overBudget} of 25`, tone: overBudget > 8 ? "var(--vermilion)" : "var(--ink)" },
                    { k: "Avg time used", v: fmtTime(agg.avgSeconds), tone: "var(--ink)" },
                  ].map((item) => (
                    <div key={item.k}>
                      <dt className="micro-label text-[var(--muted)]">{item.k}</dt>
                      <dd className="tnum mt-1.5 font-display text-[1.5rem] leading-none" style={{ color: item.tone }}>
                        {item.v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="mt-8 rounded-[3px] border border-[var(--rule)] bg-[var(--panel)] px-3 pb-2 pt-4 sm:px-5">
                <PaceRibbon curve={pace} height={286} />
              </div>
            </div>
          </section>

          {/* ----------------------------- KPI ledger ----------------------------- */}
          <section className="border-b border-[var(--rule)] bg-[var(--rule)]">
            <div className="mx-auto max-w-[1440px] px-0">
              <div className="grid grid-cols-2 gap-px md:grid-cols-3 xl:grid-cols-6">
                {kpis.map((k: Kpi, i) => {
                  const tone = k.delta === 0 ? "var(--muted)" : (k.delta > 0) === k.goodWhenUp ? "var(--moss)" : "var(--vermilion)";
                  return (
                    <div
                      key={k.id}
                      className="fade-up bg-[var(--panel)] px-5 py-6 lg:px-6"
                      style={{ animationDelay: `${i * 55}ms` }}
                      title={k.hint}
                    >
                      <p className="micro-label text-[var(--muted)]">{k.label}</p>
                      <p className="mt-3 flex items-baseline gap-1.5 font-display text-[clamp(2rem,3.4vw,2.75rem)] font-bold leading-none tracking-[-0.03em]">
                        <AnimatedValue text={k.value} />
                        <span className="text-[11px] font-medium tracking-normal text-[var(--muted)]">{k.unit}</span>
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5">
                          <Trend delta={k.delta} goodWhenUp={k.goodWhenUp} />
                          <span className="text-[10px] text-[var(--muted)]">vs prev</span>
                        </span>
                        <Sparkline values={k.spark} color={tone} width={78} height={26} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ---------------------------- roll-up band ---------------------------- */}
          <section className="border-b border-[var(--rule)] bg-[var(--panel)]">
            <div className="mx-auto max-w-[1440px] px-5 py-11 lg:px-8">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <p className="micro-label text-[var(--vermilion)]">Roll-up</p>
                  <h2 className="mt-2.5 font-display text-[clamp(1.75rem,3.2vw,2.5rem)] leading-[1.03] tracking-[-0.025em]">
                    One window, five ways to read it.
                  </h2>
                </div>
                <p className="max-w-[38ch] text-[12.5px] leading-relaxed text-[var(--muted)]">
                  Each column is the latest period at that grain — your last day, last week, last fortnight, last
                  month and last quarter. Tap one to push that grain into the charts below.
                </p>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-px bg-[var(--rule)] sm:grid-cols-3 lg:grid-cols-5">
                {GRAINS.map((g) => {
                  const roll = rollups[g.id];
                  const active = grain === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGrain(g.id)}
                      aria-pressed={active}
                      className="group bg-[var(--panel)] px-5 py-6 text-left transition-colors hover:bg-[var(--hover-fill)]"
                      style={active ? { boxShadow: "inset 3px 0 0 var(--indigo)" } : undefined}
                    >
                      <p className="micro-label flex items-center justify-between gap-2 text-[var(--muted)]">
                        {g.label}
                        <span className={active ? "text-[var(--indigo)]" : "opacity-60"}>
                          {active ? "ACTIVE" : roll.period}
                        </span>
                      </p>
                      <p className="tnum mt-3 font-display text-[2.15rem] font-bold leading-none tracking-[-0.03em]">
                        {roll.speed.toFixed(2)}
                        <span className="ml-1.5 text-[10px] font-medium tracking-normal text-[var(--muted)]">Q/min</span>
                      </p>
                      <p className="tnum mt-2 flex items-center gap-2 font-mono text-[11px] text-[var(--muted)]">
                        <Trend delta={roll.trend} goodWhenUp={true} />
                        {roll.accuracy.toFixed(1)}% acc · {fmtTime(roll.avgSeconds)} · {roll.attempts} papers
                      </p>
                      <div className="mt-3">
                        <Sparkline
                          values={roll.spark}
                          color={active ? "var(--indigo)" : "var(--muted)"}
                          width={120}
                          height={30}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ------------------------------ charts ------------------------------ */}
          <section className="mx-auto grid max-w-[1440px] gap-6 px-5 py-12 lg:grid-cols-12 lg:px-8">
            <div className="rounded-[3px] border border-[var(--rule)] bg-[var(--panel)] p-6 lg:col-span-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="micro-label text-[var(--muted)]">Trend · {GRAINS.find((g) => g.id === grain)?.label}</p>
                  <h3 className="mt-2 font-display text-[1.65rem] leading-none tracking-[-0.02em]">
                    Accuracy against pace
                  </h3>
                </div>
                <ul className="flex flex-wrap items-center gap-4">
                  {lineSeries.map((s) => (
                    <li key={s.name} className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span
                        className="inline-block h-[3px] w-6 rounded-full"
                        style={{ background: s.color }}
                      />
                      {s.name}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-5">
                <LineChart labels={labels} series={lineSeries} height={312} yFormat={(v) => v.toFixed(0)} />
              </div>
              <p className="mt-3 border-t border-[var(--rule)] pt-3 text-[11.5px] leading-relaxed text-[var(--muted)]">
                Accuracy is plotted as a percentage of marked answers; pace is seconds per question against the 36s
                budget. Hover the line for exact numbers in each {GRAINS.find((g) => g.id === grain)?.label.toLowerCase()} period.
              </p>
            </div>

            <div className="rounded-[3px] border border-[var(--rule)] bg-[var(--panel)] p-6 lg:col-span-4">
              <p className="micro-label text-[var(--muted)]">Answer mix · this window</p>
              <h3 className="mt-2 font-display text-[1.65rem] leading-none tracking-[-0.02em]">
                Correct, wrong, left
              </h3>
              <div className="mt-7">
                <Donut
                  segments={[
                    { label: "Correct", value: agg.correct, color: "var(--moss)" },
                    { label: "Wrong", value: agg.wrong, color: "var(--vermilion)" },
                    { label: "Skipped", value: agg.skipped, color: "var(--rule)" },
                  ]}
                  centerValue={`${agg.accuracy.toFixed(1)}%`}
                  centerLabel="Accuracy"
                  size={196}
                  thickness={24}
                />
              </div>
              <p className="mt-7 border-t border-[var(--rule)] pt-3 text-[11.5px] leading-relaxed text-[var(--muted)]">
                {agg.correct} correct of {agg.correct + agg.wrong} marked. Skipping is free; a wrong answer is not —
                SSC still deducts 0.50 marks per error.
              </p>
            </div>

            <div className="rounded-[3px] border border-[var(--rule)] bg-[var(--panel)] p-6 lg:col-span-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="micro-label text-[var(--muted)]">Section comparison</p>
                  <h3 className="mt-2 font-display text-[1.65rem] leading-none tracking-[-0.02em]">
                    Maths vs Reasoning
                  </h3>
                </div>
                <ul className="flex flex-wrap items-center gap-4">
                  {barSeries.map((s) => (
                    <li key={s.name} className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
                      {s.name}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-5">
                <GroupedBars labels={labels} series={barSeries} height={286} valueFormat={(v) => `${v.toFixed(1)} correct`} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-px border-t border-[var(--rule)] bg-[var(--rule)] pt-px">
                {(["maths", "reasoning"] as Section[]).map((s) => {
                  const sub = aggregate(filtered.filter((r) => r.section === s));
                  return (
                    <div key={s} className="bg-[var(--panel)] px-1 pt-4">
                      <p className="micro-label flex items-center gap-2 text-[var(--muted)]">
                        <span
                          className="inline-block h-2 w-2 rounded-[2px]"
                          style={{ background: s === "maths" ? "var(--indigo)" : "var(--vermilion)" }}
                        />
                        {SECTION_SHORT[s]}
                      </p>
                      <p className="tnum mt-2 font-display text-[1.65rem] leading-none">
                        {sub.accuracy.toFixed(1)}%
                        <span className="ml-2 text-[11px] font-medium text-[var(--muted)]">accuracy</span>
                      </p>
                      <p className="tnum mt-1.5 font-mono text-[11px] text-[var(--muted)]">
                        {sub.speed.toFixed(2)} Q/min · {fmtTime(sub.avgSeconds)} avg · {sub.attempts} papers
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[3px] border border-[var(--rule)] bg-[var(--panel)] p-6 lg:col-span-5">
              <p className="micro-label text-[var(--muted)]">Topic diagnostics</p>
              <h3 className="mt-2 font-display text-[1.65rem] leading-none tracking-[-0.02em]">
                Where marks are leaking
              </h3>
              <ul className="mt-6 space-y-5">
                {topics.map((t) => {
                  const color = t.accuracy < 66 ? "var(--vermilion)" : t.accuracy < 80 ? "var(--indigo)" : "var(--moss)";
                  return (
                    <li key={`${t.section}-${t.topic}`}>
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-[12.5px] text-[var(--ink)]">
                          <span
                            className="mr-2 inline-block h-2 w-2 rounded-[2px]"
                            style={{ background: t.section === "maths" ? "var(--indigo)" : "var(--vermilion)" }}
                          />
                          {t.topic}
                        </span>
                        <span className="tnum font-mono text-[11px] text-[var(--muted)]">
                          {t.accuracy.toFixed(0)}% · {t.secPerQ.toFixed(1)}s/Q
                        </span>
                      </div>
                      <div className="mt-2 h-[7px] w-full bg-[var(--panel-2)]">
                        <div
                          className="h-full sweep"
                          style={{ width: `${Math.max(3, t.accuracy)}%`, background: color }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-7 border-t border-[var(--rule)] pt-3 text-[11.5px] leading-relaxed text-[var(--muted)]">
                Ranked by accuracy, worst first — these are the topics to drill in the next fifteen-minute window.
                Full pool covers {TOPICS.maths.length + TOPICS.reasoning.length} SSC topics across both sections.
              </p>
            </div>
          </section>

          {/* ------------------------------- table ------------------------------- */}
          <section className="border-t border-[var(--rule)] bg-[var(--panel-2)]">
            <div className="mx-auto max-w-[1440px] px-5 py-12 lg:px-8">
              <AttemptsTable rows={filtered} />
            </div>
          </section>

          {/* -------------------------------- log -------------------------------- */}
          <section id="log" className="border-t border-[var(--rule)]">
            <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 lg:grid-cols-12 lg:px-8">
              <div className="lg:col-span-7">
                <LogForm onLogged={load} />
              </div>
              <div className="lg:col-span-5">
                <p className="micro-label text-[var(--vermilion)]">How the register scores</p>
                <h3 className="mt-3 font-display text-[clamp(1.85rem,3.2vw,2.55rem)] leading-[1.04] tracking-[-0.025em]">
                  Fifteen minutes, twenty-five questions, no negotiation.
                </h3>
                <div className="mt-7 space-y-px bg-[var(--rule)]">
                  {[
                    {
                      n: "01",
                      t: "The window never moves",
                      d: "Every attempt is measured against the same 900 seconds. Time used is time used — finishing early is the only margin you get.",
                    },
                    {
                      n: "02",
                      t: "36 seconds per question",
                      d: "The ribbon shows where your clock leaks. Questions 18–25 are usually the expensive ones under pressure.",
                    },
                    {
                      n: "03",
                      t: "Accuracy beats volume",
                      d: "SSC deducts 0.50 marks per wrong answer. A target-met attempt is 25 done with 80% or better inside the window.",
                    },
                    {
                      n: "04",
                      t: "Review on a rhythm",
                      d: "Daily for pace, weekly for trend, monthly and quarterly for the shape of the preparation before the exam.",
                    },
                  ].map((item) => (
                    <div key={item.n} className="flex gap-5 bg-[var(--paper)] px-1 py-5">
                      <span className="tnum font-mono text-[11px] text-[var(--vermilion)]">{item.n}</span>
                      <div>
                        <p className="text-[13.5px] font-semibold text-[var(--ink)]">{item.t}</p>
                        <p className="mt-1.5 max-w-[46ch] text-[12.5px] leading-relaxed text-[var(--muted)]">{item.d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ------------------------------- footer ------------------------------- */}
      <footer className="border-t border-[var(--rule)] bg-[var(--panel)]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-6 px-5 py-9 lg:px-8">
          <div className="flex items-center gap-3">
            <Mark size={38} />
            <div>
              <p className="font-display text-[15px] leading-none">Pace Register</p>
              <p className="micro-label mt-1.5 text-[var(--muted)]">
                {formatDay(range.from, true)} → {formatDay(range.to, true)} · {segment === "all" ? "Both sections" : SECTION_SHORT[segment]}
              </p>
            </div>
          </div>
          <p className="max-w-[46ch] text-[11.5px] leading-relaxed text-[var(--muted)]">
            Practice analytics for SSC CGL, CHSL and MTS sectional preparation. Data is stored on your own
            PostgreSQL instance and served through the Pace Register API. Install the app for offline review.
          </p>
        </div>
      </footer>
    </div>
  );
}
