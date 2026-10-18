"use client";

import { useState } from "react";
import type { ExplainResult } from "@/server/ai/explain";
import { ClaimList, EvidenceList } from "./claims";
import { formatDateTime } from "@/lib/format";

type Action = { kind: string; label: string };

export function ExplainPanel({ subject, id, actions }: { subject: "news" | "proposition"; id: string; actions: Action[] }) {
  const [results, setResults] = useState<Array<{ kind: string; label: string; data: ExplainResult | null; error: string | null }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [term, setTerm] = useState("");

  async function run(kind: string, label: string) {
    if (busy) return;
    setBusy(kind);
    setResults((r) => [{ kind, label, data: null, error: null }, ...r.filter((x) => x.kind !== kind)]);
    try {
      const res = await fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, id, kind }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Erro ${res.status}`);
      setResults((r) => r.map((x) => (x.kind === kind ? { ...x, data: body } : x)));
    } catch (err) {
      setResults((r) => r.map((x) => (x.kind === kind ? { ...x, error: err instanceof Error ? err.message : "Falha técnica" } : x)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Ações de explicação">
        {actions.map((a) => (
          <button key={a.kind} type="button" onClick={() => run(a.kind, a.label)} disabled={!!busy} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-surface-2 disabled:opacity-50">
            {busy === a.kind ? "Gerando…" : a.label}
          </button>
        ))}
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (term.trim()) void run(`termo:${term.trim().slice(0, 60)}`, `Termo: ${term.trim()}`);
          }}
        >
          <label htmlFor={`termo-${id}`} className="sr-only">Explique esse termo</label>
          <input id={`termo-${id}`} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Explique o termo…" className="w-36 rounded-full border border-line bg-surface px-3 py-1 text-sm" />
          <button type="submit" disabled={!!busy || !term.trim()} className="rounded-full border border-line px-3 py-1 text-sm disabled:opacity-50">OK</button>
        </form>
      </div>
      <div aria-live="polite" className="mt-4 space-y-6">
        {results.map((r) => (
          <div key={r.kind} className="rounded-xl border border-line p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{r.label}</p>
            {!r.data && !r.error && <p className="mt-2 text-sm text-ink-3">Gerando a partir das fontes…</p>}
            {r.error && <p role="alert" className="mt-2 rounded-lg bg-err-bg px-3 py-2 text-sm text-err-ink">Falha técnica: {r.error}</p>}
            {r.data && <ResultView r={r.data} anchor={`x-${r.kind.replace(/[^a-z0-9]/gi, "")}`} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultView({ r, anchor }: { r: ExplainResult; anchor: string }) {
  if (r.status === "indisponivel") {
    return (
      <div className="mt-2 text-sm">
        <p className="rounded-lg bg-warn-bg px-3 py-2 text-warn-ink">{r.reason}</p>
        <EvidenceList evidence={r.evidence} anchorPrefix={anchor} title="Registros disponíveis" />
      </div>
    );
  }
  const e = r.explanation;
  return (
    <div className="mt-2 space-y-4 text-sm">
      {r.status === "abstencao" && (
        <p className="rounded-lg bg-warn-bg px-3 py-2 text-warn-ink">Não foi possível verificar uma explicação com as fontes disponíveis.</p>
      )}
      {e.resumo && <p className="text-base text-ink">{e.resumo}</p>}
      {e.secoes.map((s) => (
        <section key={s.chave}>
          <h3 className="mb-1 font-serif text-base font-semibold">{s.titulo}</h3>
          <ClaimList claims={s.itens} anchorPrefix={anchor} />
        </section>
      ))}
      {e.termos.length > 0 && (
        <section>
          <h3 className="mb-1 font-serif text-base font-semibold">Termos</h3>
          <dl className="space-y-1">
            {e.termos.map((t) => (
              <div key={t.termo}>
                <dt className="font-semibold">{t.termo}</dt>
                <dd className="text-ink-2">{t.explicacao} <span className="text-xs text-ink-3">(explicação geral do termo)</span></dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {e.ressalvas.length > 0 && (
        <section>
          <h3 className="mb-1 font-semibold">Ressalvas</h3>
          <ul className="ml-4 list-disc text-ink-2">{e.ressalvas.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      )}
      {e.informacaoQueFalta.length > 0 && (
        <section>
          <h3 className="mb-1 font-semibold">O que ainda não se sabe / falta verificar</h3>
          <ul className="ml-4 list-disc text-ink-2">{e.informacaoQueFalta.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      )}
      {r.validation.removed.length > 0 && (
        <details className="text-xs text-ink-3">
          <summary className="cursor-pointer">{r.validation.removed.length} trecho(s) removido(s) pela verificação automática</summary>
          <ul className="ml-4 mt-1 list-disc">{r.validation.removed.map((x, i) => <li key={i}>{x.motivo}</li>)}</ul>
        </details>
      )}
      <EvidenceList evidence={r.evidence} anchorPrefix={anchor} />
      <p className="text-xs text-ink-3">
        Gerado por IA ({r.model}) em {formatDateTime(r.createdAt)}{r.cached ? " (reaproveitado — mesma versão das fontes)" : ""}. Versão das fontes: {r.subjectVersionHash.slice(0, 10)}.
      </p>
    </div>
  );
}
