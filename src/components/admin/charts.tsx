"use client";
/**
 * Chart components. Palette validated with the dataviz validator:
 * series-1 #2F6FDE (inbound), series-2 #0FA38A (outbound). Axes and grid are
 * recessive; every chart has hover tooltips and a legend for >= 2 series.
 */
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, BarChart3 } from "lucide-react";

const S1 = "#2F6FDE";
const S2 = "#0FA38A";
const GRID = "#EEF0F4";

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function TooltipBox({ active, payload, label, unit = "" }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-pop">
      <div className="mb-1 font-medium text-ink">{label ? fmtDay(label) : ""}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-ink-3">
            <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular font-medium text-ink">
            {unit === "$" ? `$${Number(p.value).toFixed(2)}` : Number(p.value).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-4 text-[12px] text-ink-3">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function MessagesChart({ data }: { data: { date: string; inbound: number; outbound: number }[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const total = data.reduce((s, d) => s + d.inbound + d.outbound, 0);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Legend items={[{ label: "From users", color: S1 }, { label: "From Calm-1", color: S2 }]} />
        <button onClick={() => setView(view === "chart" ? "table" : "chart")} className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-ink-3 hover:bg-surface-sunken hover:text-ink" aria-label={view === "chart" ? "Show as table" : "Show as chart"}>
          {view === "chart" ? <Table2 className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
          {view === "chart" ? "Table" : "Chart"}
        </button>
      </div>
      {view === "chart" ? (
        <div className="h-[260px]">
          {total === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-ink-4">No messages in this period.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tickLine={false} axisLine={false} minTickGap={24} dy={6} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={44} />
                <Tooltip cursor={{ fill: "rgba(47,111,222,0.06)" }} content={<TooltipBox />} />
                <Bar dataKey="inbound" name="From users" stackId="m" fill={S1} stroke="#fff" strokeWidth={1} />
                <Bar dataKey="outbound" name="From Calm-1" stackId="m" fill={S2} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      ) : (
        <div className="max-h-[260px] overflow-y-auto scroll-thin">
          <table className="w-full text-[12.5px]">
            <thead className="text-ink-4">
              <tr>
                <th className="py-1 text-left font-medium">Date</th>
                <th className="py-1 text-right font-medium">From users</th>
                <th className="py-1 text-right font-medium">From Calm-1</th>
              </tr>
            </thead>
            <tbody className="tabular text-ink-2">
              {data.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="py-1">{fmtDay(d.date)}</td>
                  <td className="py-1 text-right">{d.inbound}</td>
                  <td className="py-1 text-right">{d.outbound}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Ring({ value, label, sub }: { value: number | null; label: string; sub?: string }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col items-center">
      <svg width="148" height="148" viewBox="0 0 148 148" role="img" aria-label={`${label}: ${value === null ? "no data" : `${pct.toFixed(0)}%`}`}>
        <circle cx="74" cy="74" r={r} fill="none" stroke="#EEF0F4" strokeWidth="12" />
        {pct > 0 ? <circle cx="74" cy="74" r={r} fill="none" stroke={S1} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 74 74)" style={{ transition: "stroke-dasharray .6s ease" }} /> : null}
        <text x="74" y="72" textAnchor="middle" className="fill-ink" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {value === null ? "—" : `${pct.toFixed(0)}%`}
        </text>
        <text x="74" y="94" textAnchor="middle" style={{ fontSize: 11.5, fill: "#8C97AC" }}>
          {label}
        </text>
      </svg>
      {sub ? <div className="mt-1 text-center text-[12px] text-ink-3">{sub}</div> : null}
    </div>
  );
}

export function LineSeries({ data, dataKey, name, unit }: { data: Record<string, number | string>[]; dataKey: string; name: string; unit?: string }) {
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="date" tickFormatter={fmtDay} tickLine={false} axisLine={false} minTickGap={28} dy={6} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={unit === "$"} width={44} />
          <Tooltip cursor={{ stroke: "#D5DAE3" }} content={<TooltipBox unit={unit} />} />
          <Line type="monotone" dataKey={dataKey} name={name} stroke={S1} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} animationDuration={500} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaSeries({ data, dataKey, name, unit }: { data: Record<string, number | string>[]; dataKey: string; name: string; unit?: string }) {
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={S2} stopOpacity={0.18} />
              <stop offset="1" stopColor={S2} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="date" tickFormatter={fmtDay} tickLine={false} axisLine={false} minTickGap={28} dy={6} />
          <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => (unit === "$" ? `$${v < 10 ? v.toFixed(2) : v.toFixed(0)}` : String(v))} />
          <Tooltip cursor={{ stroke: "#D5DAE3" }} content={<TooltipBox unit={unit} />} />
          <Area type="monotone" dataKey={dataKey} name={name} stroke={S2} strokeWidth={2} fill={`url(#grad-${dataKey})`} animationDuration={500} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBars({ data }: { data: { label: string; value: number; previous?: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <div className="py-8 text-center text-[13px] text-ink-4">No tool calls in this period.</div>;
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="group" title={`${d.label}: ${d.value}${d.previous !== undefined ? ` (previous ${d.previous})` : ""}`}>
          <div className="mb-1 flex justify-between text-[12.5px]">
            <span className="text-ink-2">{d.label}</span>
            <span className="tabular font-medium text-ink">{d.value.toLocaleString()}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-sunken">
            <div className="h-2 rounded-full bg-series-1 transition-all group-hover:opacity-90" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
