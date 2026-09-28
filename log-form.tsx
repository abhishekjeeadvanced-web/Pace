"use client";

import { useMemo, useState } from "react";
import { fmtTime } from "@/lib/analytics";
import { BUDGET_SECONDS, SECTION_SHORT, TOPICS, type Section } from "@/lib/types";

export function LogForm({ onLogged }: { onLogged: () => void }) {
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }, []);

  const [day, setDay] = useState(today);
  const [section, setSection] = useState<Section>("maths");
  const [topic, setTopic] = useState(TOPICS.maths[0]);
  const [correct, setCorrect] = useState(18);
  const [wrong, setWrong] = useState(5);
  const [minutes, setMinutes] = useState(13);
  const [seconds, setSeconds] = useState(20);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const attempted = Math.min(25, correct + wrong);
  const skipped = Math.max(0, 25 - attempted);
  const totalSeconds = Math.min(BUDGET_SECONDS, Math.max(30, minutes * 60 + seconds));
  const perQ = totalSeconds / Math.max(1, attempted);
  const accuracy = attempted ? (correct / attempted) * 100 : 0;
  const paceState = perQ > 36 ? "over" : perQ > 33 ? "edge" : "inside";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day,
          section,
          topic,
          correct,
          wrong,
          seconds: totalSeconds,
          note: note || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Could not save that attempt.");
      setMessage({ kind: "ok", text: `Logged ${SECTION_SHORT[section]} · ${formatDayShort(day)} · ${correct}/${attempted} in ${fmtTime(totalSeconds)}.` });
      onLogged();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Could not save that attempt." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-[3px] border border-[var(--rule)] bg-[var(--panel)] p-6 sm:p-7">
      <p className="micro-label text-[var(--vermilion)]">Log today&apos;s speed</p>
      <h3 className="mt-2 font-display text-[clamp(1.55rem,2.6vw,2.15rem)] leading-[1.05] tracking-[-0.02em]">
        One paper. Fifteen minutes.
      </h3>
      <p className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-[var(--muted)]">
        Record the sectional you just finished — the register recalculates pace, accuracy and the ribbon
        immediately.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <label className="col-span-2 block">
          <span className="micro-label text-[var(--muted)]">Date</span>
          <input type="date" className="field mt-1.5 w-full" value={day} max={today} onChange={(e) => setDay(e.target.value)} required />
        </label>

        <label className="block">
          <span className="micro-label text-[var(--muted)]">Section</span>
          <select
            className="field mt-1.5 w-full"
            value={section}
            onChange={(e) => {
              const next = e.target.value as Section;
              setSection(next);
              setTopic(TOPICS[next][0]);
            }}
          >
            <option value="maths">Quantitative Aptitude</option>
            <option value="reasoning">Reasoning</option>
          </select>
        </label>

        <label className="block">
          <span className="micro-label text-[var(--muted)]">Topic drilled</span>
          <select className="field mt-1.5 w-full" value={topic} onChange={(e) => setTopic(e.target.value)}>
            {TOPICS[section].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="micro-label text-[var(--muted)]">Correct</span>
          <input
            type="number"
            min={0}
            max={25}
            className="field tnum mt-1.5 w-full font-mono"
            value={correct}
            onChange={(e) => setCorrect(Math.max(0, Math.min(25, Number(e.target.value) || 0)))}
            required
          />
        </label>

        <label className="block">
          <span className="micro-label text-[var(--muted)]">Wrong</span>
          <input
            type="number"
            min={0}
            max={25}
            className="field tnum mt-1.5 w-full font-mono"
            value={wrong}
            onChange={(e) => setWrong(Math.max(0, Math.min(25, Number(e.target.value) || 0)))}
            required
          />
        </label>

        <label className="block">
          <span className="micro-label text-[var(--muted)]">Minutes used</span>
          <input
            type="number"
            min={0}
            max={15}
            className="field tnum mt-1.5 w-full font-mono"
            value={minutes}
            onChange={(e) => setMinutes(Math.max(0, Math.min(15, Number(e.target.value) || 0)))}
          />
        </label>

        <label className="block">
          <span className="micro-label text-[var(--muted)]">Seconds</span>
          <input
            type="number"
            min={0}
            max={59}
            className="field tnum mt-1.5 w-full font-mono"
            value={seconds}
            onChange={(e) => setSeconds(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
          />
        </label>

        <label className="col-span-2 block">
          <span className="micro-label text-[var(--muted)]">Note (optional)</span>
          <input
            className="field mt-1.5 w-full"
            placeholder="Lost 90s on one DI set…"
            value={note}
            maxLength={160}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-4">
        {[
          { label: "Attempted", value: `${attempted}/25` },
          { label: "Skipped", value: `${skipped}` },
          { label: "Accuracy", value: `${accuracy.toFixed(1)}%` },
          { label: "Avg / Q", value: `${perQ.toFixed(1)}s` },
        ].map((m) => (
          <div key={m.label} className="bg-[var(--panel-2)] px-3 py-3">
            <p className="micro-label text-[var(--muted)]">{m.label}</p>
            <p className="tnum mt-1 font-display text-xl leading-none">{m.value}</p>
          </div>
        ))}
      </div>

      <p
        className="mt-3 text-[12px]"
        style={{
          color:
            paceState === "over" ? "var(--vermilion)" : paceState === "edge" ? "var(--muted)" : "var(--moss)",
        }}
      >
        {paceState === "over"
          ? `${(perQ - 36).toFixed(1)}s per question over the 36s budget — trim the slow middle questions.`
          : paceState === "edge"
            ? "Sitting right on the 36s budget. Comfortable, but no margin."
            : `${(36 - perQ).toFixed(1)}s per question inside budget — that is exam-day pace.`}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save attempt"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setCorrect(18);
            setWrong(5);
            setMinutes(13);
            setSeconds(20);
            setNote("");
            setMessage(null);
          }}
        >
          Reset
        </button>
      </div>

      {message && (
        <p
          role="status"
          className="mt-4 border-l-2 pl-3 text-[12px]"
          style={{ color: message.kind === "ok" ? "var(--moss)" : "var(--vermilion)", borderColor: "currentColor" }}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

function formatDayShort(day: string) {
  const [, m, d] = day.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[(m || 1) - 1]}`;
}
