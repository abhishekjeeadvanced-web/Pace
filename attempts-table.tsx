"use client";

import { useMemo, useState } from "react";
import { fmtTime, formatDay, isTargetMet } from "@/lib/analytics";
import { SECTION_SHORT, type Attempt } from "@/lib/types";

type SortKey = "day" | "section" | "topic" | "attempted" | "correct" | "wrong" | "skipped" | "accuracy" | "seconds" | "avgq" | "speed";

type Row = Attempt & { attempted: number; accuracy: number; avgq: number; speed: number; met: boolean };

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "day", label: "Date" },
  { key: "section", label: "Section" },
  { key: "topic", label: "Topic drilled" },
  { key: "attempted", label: "Done", align: "right" },
  { key: "correct", label: "Correct", align: "right" },
  { key: "wrong", label: "Wrong", align: "right" },
  { key: "skipped", label: "Skip", align: "right" },
  { key: "accuracy", label: "Acc %", align: "right" },
  { key: "seconds", label: "Time used", align: "right" },
  { key: "avgq", label: "Avg / Q", align: "right" },
  { key: "speed", label: "Q per min", align: "right" },
];

function decorate(a: Attempt): Row {
  const attempted = a.correct + a.wrong;
  return {
    ...a,
    attempted,
    accuracy: attempted ? (a.correct / attempted) * 100 : 0,
    avgq: a.seconds / Math.max(1, a.questions),
    speed: attempted / (a.seconds / 60),
    met: isTargetMet(a),
  };
}

export function AttemptsTable({ rows }: { rows: Attempt[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("day");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [onlyTargets, setOnlyTargets] = useState(false);
  const perPage = 12;

  const decorated = useMemo(() => rows.map(decorate), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decorated.filter((r) => {
      if (onlyTargets && !r.met) return false;
      if (!q) return true;
      return (
        r.day.includes(q) ||
        r.topic.toLowerCase().includes(q) ||
        SECTION_SHORT[r.section].toLowerCase().includes(q) ||
        (r.note ?? "").toLowerCase().includes(q)
      );
    });
  }, [decorated, query, onlyTargets]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const current = Math.min(page, pages - 1);
  const slice = sorted.slice(current * perPage, current * perPage + perPage);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "day" ? "desc" : "asc");
    }
    setPage(0);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5">
        <div>
          <p className="micro-label text-[var(--vermilion)]">The register</p>
          <h2 className="mt-2 font-display text-[clamp(1.65rem,3vw,2.35rem)] leading-none tracking-[-0.02em]">
            Every attempt, sortable
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
            <input
              type="checkbox"
              checked={onlyTargets}
              onChange={(e) => {
                setOnlyTargets(e.target.checked);
                setPage(0);
              }}
              className="h-4 w-4 accent-[var(--indigo)]"
            />
            Target met only
          </label>
          <input
            className="field w-[220px]"
            placeholder="Search topic, date, note…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            aria-label="Search attempts"
          />
        </div>
      </div>

      <div className="scroll-thin overflow-x-auto border border-[var(--rule)] bg-[var(--panel)]">
        <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-[var(--rule)] bg-[var(--panel-2)]">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`px-3 py-2.5 font-medium ${c.align === "right" ? "text-right" : "text-left"}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="micro-label inline-flex items-center gap-1.5 text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
                  >
                    {c.label}
                    <span className={`text-[8px] ${sortKey === c.key ? "text-[var(--vermilion)]" : "opacity-25"}`}>
                      {sortKey === c.key && sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-right">
                <span className="micro-label text-[var(--muted)]">Status</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.id} className="border-b border-[var(--rule)] transition-colors last:border-0 hover:bg-[var(--hover-fill)]">
                <td className="tnum whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-[var(--muted)]">
                  {formatDay(r.day, true)}
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-[2px]"
                      style={{ background: r.section === "maths" ? "var(--indigo)" : "var(--vermilion)" }}
                    />
                    {SECTION_SHORT[r.section]}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-[var(--ink)]">{r.topic}</span>
                  {r.note && <span className="ml-2 text-[11px] text-[var(--muted)]">— {r.note}</span>}
                </td>
                <td className="tnum px-3 py-2.5 text-right font-mono">{r.attempted}/25</td>
                <td className="tnum px-3 py-2.5 text-right font-mono text-[var(--moss)]">{r.correct}</td>
                <td className="tnum px-3 py-2.5 text-right font-mono text-[var(--vermilion)]">{r.wrong}</td>
                <td className="tnum px-3 py-2.5 text-right font-mono text-[var(--muted)]">{r.skipped}</td>
                <td className="tnum px-3 py-2.5 text-right font-mono">{r.accuracy.toFixed(1)}</td>
                <td className="tnum px-3 py-2.5 text-right font-mono">{fmtTime(r.seconds)}</td>
                <td className="tnum px-3 py-2.5 text-right font-mono">{r.avgq.toFixed(1)}s</td>
                <td className="tnum px-3 py-2.5 text-right font-mono">{r.speed.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right">
                  <span
                    className="micro-label inline-flex items-center gap-1.5 whitespace-nowrap rounded-[2px] border px-2 py-1"
                    style={{
                      color: r.met ? "var(--moss)" : r.seconds >= 900 ? "var(--vermilion)" : "var(--muted)",
                      borderColor: r.met ? "var(--moss)" : "var(--rule)",
                    }}
                  >
                    {r.met ? "Target met" : r.seconds >= 900 ? "Timed out" : "In progress"}
                  </span>
                </td>
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-16 text-center">
                  <p className="font-display text-xl text-[var(--ink)]">Nothing matches that search</p>
                  <p className="mt-2 text-[13px] text-[var(--muted)]">Clear the filters to see the full register again.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="tnum font-mono text-[11px] text-[var(--muted)]">
          Showing {sorted.length === 0 ? 0 : current * perPage + 1}–{Math.min(sorted.length, (current + 1) * perPage)} of{" "}
          {sorted.length} attempts
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0}>
            ← Prev
          </button>
          <span className="tnum font-mono text-[11px] text-[var(--muted)]">
            {current + 1} / {pages}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPage(Math.min(pages - 1, current + 1))}
            disabled={current >= pages - 1}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
