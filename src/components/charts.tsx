"use client";

import { useState } from "react";

const fmtCompact = (v: number) =>
  v >= 1_000_000
    ? `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : v >= 1_000
      ? `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`
      : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
/** Eixo: sem "R$" para caber (a unidade está no título do gráfico). */
const fmtAxis = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : v >= 1_000 ? `${Math.round(v / 1_000)} mil` : `${Math.round(v)}`;
const fmtFull = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Colunas de série única (ex.: gasto por mês). Uma cor só, sem legenda (o título nomeia a série),
 * colunas ≤ 24px com topo arredondado, tooltip por mark (hover e foco), valor do maior mês rotulado.
 */
export function ColumnChart({ data, ariaLabel }: { data: Array<{ label: string; value: number }>; ariaLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const peak = data.findIndex((d) => d.value === max);
  const ticks = [0, max / 2, max];
  return (
    <figure className="relative">
      <div role="img" aria-label={ariaLabel} className="relative mt-6 flex h-44 items-end gap-0.5 border-b border-line pl-12">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-full" aria-hidden>
          {ticks.map((t, i) => (
            <div key={i} className="absolute left-0 flex w-full items-center" style={{ bottom: `${(t / max) * 100}%` }}>
              <span className="w-12 whitespace-nowrap pr-2 text-right text-[11px] text-ink-3">{fmtAxis(t)}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          ))}
        </div>
        {data.map((d, i) => (
          <button
            key={d.label}
            type="button"
            className="relative flex h-full flex-1 items-end justify-center focus:outline-none"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            aria-label={`${d.label}: ${fmtFull(d.value)}`}
          >
            <span
              className={`w-full max-w-6 rounded-t-[4px] bg-chart-1 transition-opacity ${active !== null && active !== i ? "opacity-50" : ""}`}
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
            />
            {i === peak && active === null && (
              <span className="absolute whitespace-nowrap text-[11px] font-semibold text-ink-2" style={{ bottom: `calc(${(d.value / max) * 100}% + 4px)` }}>
                {fmtCompact(d.value)}
              </span>
            )}
            {active === i && (
              <span role="tooltip" className="absolute z-10 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left text-xs shadow-card" style={{ bottom: `calc(${(d.value / max) * 100}% + 8px)` }}>
                <strong className="block text-sm text-ink">{fmtFull(d.value)}</strong>
                <span className="text-ink-3">{d.label}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex gap-0.5 pl-12 pt-1" aria-hidden>
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-[11px] text-ink-3">
            {d.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Barras horizontais ordenadas, todas rotuladas (nome à esquerda, valor na ponta). */
export function BarList({ data, total }: { data: Array<{ label: string; value: number; detail?: string }>; total?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label} className="text-sm" title={d.detail ? `${d.label}: ${fmtFull(d.value)} · ${d.detail}` : `${d.label}: ${fmtFull(d.value)}`}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-ink">{d.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">
              {fmtCompact(d.value)}
              {total ? <span className="ml-1 font-normal text-ink-3">{Math.round((d.value / total) * 100)}%</span> : null}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-chart-track">
            <div className="h-2 rounded-full bg-chart-1" style={{ width: `${Math.max(1, (d.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
