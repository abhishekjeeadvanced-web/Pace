"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { SECONDS_PER_QUESTION } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* measurement                                                         */
/* ------------------------------------------------------------------ */

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

/* ------------------------------------------------------------------ */
/* geometry                                                            */
/* ------------------------------------------------------------------ */

type Pt = { x: number; y: number };

function smoothPath(pts: Pt[], smoothing = 0.7) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * smoothing;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * smoothing;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * smoothing;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * smoothing;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function niceTicks(min: number, max: number, count: number) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (span / count) / step;
  const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const s = step * mult;
  const start = Math.floor(min / s) * s;
  const ticks: number[] = [];
  for (let v = start; v <= max + s; v += s) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

const uid = (() => {
  let i = 0;
  return () => `c${++i}`;
})();

/* ------------------------------------------------------------------ */
/* shared tooltip                                                      */
/* ------------------------------------------------------------------ */

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const w = 186;
  const left = Math.max(6, Math.min(width - w - 6, x - w / 2));
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-[3px] border border-[var(--rule)] bg-[var(--panel)] px-3 py-2 shadow-[0_10px_30px_rgba(20,18,12,0.18)]"
      style={{ left, top: y, width: w }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

export function Sparkline({ values, color = "var(--indigo)", width = 92, height = 30 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts: Pt[] = values.map((v, i) => ({
    x: (i / (values.length - 1)) * (width - 2) + 1,
    y: height - 3 - ((v - min) / span) * (height - 8),
  }));
  const d = smoothPath(pts, 0.6);
  return (
    <svg width={width} height={height} aria-hidden="true" className="overflow-visible">
      <path d={`${d} L ${pts[pts.length - 1].x} ${height} L ${pts[0].x} ${height} Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={2.4} fill={color} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Pace ribbon — the 15:00 hero                                        */
/* ------------------------------------------------------------------ */

export function PaceRibbon({ curve, height = 260 }: { curve: number[]; height?: number }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const idRef = useRef(uid());
  const id = idRef.current;

  const pad = { top: 22, right: 18, bottom: 34, left: 46 };
  const w = Math.max(240, width || 900);
  const innerW = w - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const values = curve.length ? curve : new Array(25).fill(SECONDS_PER_QUESTION);
  const maxV = Math.max(...values, SECONDS_PER_QUESTION) * 1.18;
  const minV = 0;
  const xAt = (i: number) => pad.left + (i / (values.length - 1)) * innerW;
  const yAt = (v: number) => pad.top + innerH - ((v - minV) / (maxV - minV)) * innerH;

  const pts = values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const line = smoothPath(pts, 0.7);
  const budgetY = yAt(SECONDS_PER_QUESTION);
  const area = `${line} L ${pts[pts.length - 1].x} ${budgetY} L ${pts[0].x} ${budgetY} Z`;
  const ticks = niceTicks(0, maxV, 4);

  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ height }}>
      {width > 0 && (
        <svg
          width={w}
          height={height}
          role="img"
          aria-label="Average seconds spent per question across the 15 minute paper"
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const rel = e.clientX - rect.left - pad.left;
            const idx = Math.round((rel / innerW) * (values.length - 1));
            setHover(Math.max(0, Math.min(values.length - 1, idx)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={`${id}-above`}>
              <rect x={pad.left} y={pad.top} width={innerW} height={Math.max(0, budgetY - pad.top)} />
            </clipPath>
            <clipPath id={`${id}-below`}>
              <rect x={pad.left} y={budgetY} width={innerW} height={Math.max(0, pad.top + innerH - budgetY)} />
            </clipPath>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--indigo)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--indigo)" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={w - pad.right} y1={yAt(t)} y2={yAt(t)} stroke="var(--rule)" strokeWidth={1} />
              <text x={pad.left - 10} y={yAt(t) + 4} textAnchor="end" className="chart-axis">
                {Math.round(t)}s
              </text>
            </g>
          ))}

          <path d={area} fill={`url(#${id}-fill)`} clipPath={`url(#${id}-below)`} />
          <path d={area} fill="var(--vermilion)" opacity={0.26} clipPath={`url(#${id}-above)`} />

          <line x1={pad.left} x2={w - pad.right} y1={budgetY} y2={budgetY} stroke="var(--vermilion)" strokeWidth={1.4} strokeDasharray="6 5" />
          <text x={w - pad.right} y={budgetY - 8} textAnchor="end" className="chart-axis" fill="var(--vermilion)">
            36s / question budget
          </text>

          <path
            key={values.map((v) => Math.round(v)).join("-")}
            d={line}
            fill="none"
            stroke="var(--indigo)"
            strokeWidth={2.4}
            strokeLinecap="round"
            className="draw-in"
          />

          {pts.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={hover === i ? 5 : 2.6}
              fill={values[i] > SECONDS_PER_QUESTION ? "var(--vermilion)" : "var(--indigo)"}
              className="transition-all duration-200"
            />
          ))}

          {hover !== null && (
            <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={pad.top + innerH} stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 4" opacity={0.45} />
          )}

          {[0, 4, 9, 14, 19, 24].map((i) => (
            <text key={i} x={xAt(i)} y={height - 12} textAnchor="middle" className="chart-axis">
              Q{i + 1}
            </text>
          ))}
        </svg>
      )}

      {hover !== null && width > 0 && (
        <Tooltip x={xAt(hover)} y={Math.max(4, yAt(values[hover]) - 74)} width={w}>
          <p className="micro-label text-[var(--muted)]">Question {hover + 1}</p>
          <p className="mt-1 font-display text-2xl leading-none text-[var(--ink)]">{values[hover].toFixed(1)}s</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            {values[hover] > SECONDS_PER_QUESTION ? (
              <span className="text-[var(--vermilion)]">+{(values[hover] - SECONDS_PER_QUESTION).toFixed(1)}s over budget</span>
            ) : (
              <span className="text-[var(--moss)]">{(SECONDS_PER_QUESTION - values[hover]).toFixed(1)}s inside budget</span>
            )}
          </p>
        </Tooltip>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Multi-series line chart                                             */
/* ------------------------------------------------------------------ */

export type LineSeries = {
  name: string;
  color: string;
  values: number[];
  format?: (v: number) => string;
  area?: boolean;
  dashed?: boolean;
};

export function LineChart({
  labels,
  series,
  height = 300,
  yFormat = (v) => v.toFixed(0),
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  yFormat?: (v: number) => string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const idRef = useRef(uid());
  const id = idRef.current;

  const pad = { top: 18, right: 16, bottom: 30, left: 44 };
  const w = Math.max(240, width || 720);
  const innerW = w - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const rawMin = all.length ? Math.min(...all) : 0;
  const rawMax = all.length ? Math.max(...all) : 1;
  const minV = rawMin - (rawMax - rawMin) * 0.25 - 0.5;
  const maxV = rawMax + (rawMax - rawMin) * 0.18 + 0.5;

  const n = labels.length;
  const xAt = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => pad.top + innerH - ((v - minV) / (maxV - minV || 1)) * innerH;
  const ticks = niceTicks(minV, maxV, 4);

  const labelStep = Math.max(1, Math.ceil(n / (w < 560 ? 5 : 9)));

  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ height }}>
      {width > 0 && (
        <svg
          width={w}
          height={height}
          role="img"
          aria-label="Trend chart"
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const rel = e.clientX - rect.left - pad.left;
            const idx = Math.round((rel / innerW) * (n - 1));
            setHover(Math.max(0, Math.min(n - 1, idx)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            {series.map((s, si) => (
              <linearGradient key={si} id={`${id}-g${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={w - pad.right} y1={yAt(t)} y2={yAt(t)} stroke="var(--rule)" strokeWidth={1} />
              <text x={pad.left - 9} y={yAt(t) + 4} textAnchor="end" className="chart-axis">
                {yFormat(t)}
              </text>
            </g>
          ))}

          {hover !== null && (
            <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={pad.top + innerH} stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 4" opacity={0.35} />
          )}

          {series.map((s, si) => {
            const pts = s.values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
            const d = smoothPath(pts, 0.65);
            return (
              <g key={s.name}>
                {s.area && <path d={`${d} L ${pts[pts.length - 1].x} ${pad.top + innerH} L ${pts[0].x} ${pad.top + innerH} Z`} fill={`url(#${id}-g${si})`} className="fade-in" />}
                <path
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? "7 6" : undefined}
                  className={s.dashed ? "fade-in" : "draw-in"}
                  key={s.name + (s.values[Math.floor(s.values.length / 2)] ?? 0) + "-" + (s.values[0] ?? 0)}
                />
                {pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 5 : 2.8} fill={s.color} className="transition-all duration-200" />
                ))}
              </g>
            );
          })}

          {labels.map((l, i) =>
            i % labelStep === 0 ? (
              <text key={i} x={xAt(i)} y={height - 10} textAnchor="middle" className="chart-axis">
                {l}
              </text>
            ) : null,
          )}
        </svg>
      )}

      {hover !== null && width > 0 && (
        <Tooltip x={xAt(hover)} y={8} width={w}>
          <p className="micro-label text-[var(--muted)]">{labels[hover]}</p>
          <ul className="mt-2 space-y-1">
            {series.map((s) => (
              <li key={s.name} className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="font-mono text-[12px] font-medium text-[var(--ink)]">
                  {s.format ? s.format(s.values[hover]) : s.values[hover].toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </Tooltip>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grouped bars                                                        */
/* ------------------------------------------------------------------ */

export type BarSeries = { name: string; color: string; values: number[] };

export function GroupedBars({
  labels,
  series,
  height = 280,
  valueFormat = (v: number) => v.toFixed(0),
}: {
  labels: string[];
  series: BarSeries[];
  height?: number;
  valueFormat?: (v: number) => string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const pad = { top: 16, right: 14, bottom: 30, left: 40 };
  const w = Math.max(240, width || 620);
  const innerW = w - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const n = labels.length;
  const maxV = Math.max(1, ...series.flatMap((s) => s.values)) * 1.15;
  const groupW = innerW / Math.max(1, n);
  const barW = Math.min(26, (groupW * 0.62) / series.length);
  const ticks = niceTicks(0, maxV, 4);
  const labelStep = Math.max(1, Math.ceil(n / (w < 520 ? 4 : 10)));

  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ height }}>
      {width > 0 && (
        <svg width={w} height={height} role="img" aria-label="Grouped bar chart">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={w - pad.right} y1={pad.top + innerH - (t / maxV) * innerH} y2={pad.top + innerH - (t / maxV) * innerH} stroke="var(--rule)" strokeWidth={1} />
              <text x={pad.left - 8} y={pad.top + innerH - (t / maxV) * innerH + 4} textAnchor="end" className="chart-axis">
                {Math.round(t)}
              </text>
            </g>
          ))}

          {labels.map((l, i) => {
            const gx = pad.left + i * groupW + groupW / 2;
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={pad.left + i * groupW} y={pad.top} width={groupW} height={innerH} fill={hover === i ? "var(--hover-fill)" : "transparent"} />
                {series.map((s, si) => {
                  const v = s.values[i] ?? 0;
                  const h = (v / maxV) * innerH;
                  const x = gx - (series.length * barW) / 2 + si * barW;
                  return (
                    <rect
                      key={s.name}
                      x={x}
                      y={pad.top + innerH - h}
                      width={barW - 3}
                      height={Math.max(1, h)}
                      rx={1.5}
                      fill={s.color}
                      opacity={hover === null || hover === i ? 1 : 0.45}
                      className="bar-rise"
                      style={{ transition: "y 600ms cubic-bezier(0.2,0.8,0.2,1), height 600ms cubic-bezier(0.2,0.8,0.2,1), opacity 250ms" }}
                    />
                  );
                })}
                {i % labelStep === 0 && (
                  <text x={gx} y={height - 10} textAnchor="middle" className="chart-axis">
                    {l}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {hover !== null && width > 0 && (
        <Tooltip x={pad.left + hover * groupW + groupW / 2} y={8} width={w}>
          <p className="micro-label text-[var(--muted)]">{labels[hover]}</p>
          <ul className="mt-2 space-y-1">
            {series.map((s) => (
              <li key={s.name} className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="font-mono text-[12px] font-medium text-[var(--ink)]">{valueFormat(s.values[hover] ?? 0)}</span>
              </li>
            ))}
          </ul>
        </Tooltip>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Donut                                                               */
/* ------------------------------------------------------------------ */

export function Donut({
  segments,
  size = 210,
  thickness = 26,
  centerValue,
  centerLabel,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerValue: string;
  centerLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const total = segments.reduce((a, b) => a + b.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-7">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={centerLabel}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth={thickness} opacity={0.7} />
            {segments.map((s, i) => {
              const frac = s.value / total;
              const dash = mounted ? `${frac * c} ${c}` : `0 ${c}`;
              const el = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hover === i ? thickness + 5 : thickness}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.2,0.8,0.2,1), stroke-width 200ms, stroke-dashoffset 900ms" }}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                />
              );
              offset += frac * c;
              return el;
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p className="font-display text-[2.1rem] leading-none text-[var(--ink)]">{centerValue}</p>
          <p className="micro-label mt-1 text-[var(--muted)]">{centerLabel}</p>
        </div>
      </div>

      <ul className="min-w-[150px] space-y-2.5">
        {segments.map((s, i) => (
          <li key={s.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-2.5 text-[12px] text-[var(--muted)]">
              <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-mono text-[12px] font-medium text-[var(--ink)]">
              {s.value}
              <span className="ml-1.5 text-[var(--muted)]">{((s.value / total) * 100).toFixed(1)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
