"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AssistantResponse } from "@/server/ai/assistant";
import { ClaimList, EvidenceList } from "./claims";
import { formatDate } from "@/lib/format";

type Turn = { id: number; question: string; response: AssistantResponse | null; error: string | null };

import { ROLE_LABEL } from "@/domain/authorship";

export function Assistant({
  context,
  initialQuestion,
  autoRun = false,
  suggestions = [],
  title = "Perguntar",
}: {
  context: { type: "news" | "proposition" | "person"; id: string } | null;
  initialQuestion?: string;
  autoRun?: boolean;
  suggestions?: string[];
  title?: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(autoRun ? "" : initialQuestion ?? "");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const ran = useRef(false);
  const liveRef = useRef<HTMLDivElement>(null);

  async function ask(question: string, personId?: string) {
    const q = question.trim();
    if (!q || busy) return;
    const id = Date.now();
    setTurns((t) => [...t, { id, question: q, response: null, error: null }]);
    setBusy(true);
    setInput("");
    try {
      const history = turns.flatMap((t) => [
        { role: "user" as const, text: t.question },
        { role: "assistant" as const, text: t.response?.answer?.respostaDireta ?? "" },
      ]);
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, context, history, conversationId, personId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Erro ${res.status}`);
      if (body.conversationId) setConversationId(body.conversationId);
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, response: body.response } : x)));
    } catch (err) {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: err instanceof Error ? err.message : "Falha técnica" } : x)));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoRun && initialQuestion && !ran.current) {
      ran.current = true;
      void ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, initialQuestion]);

  return (
    <section aria-label={title} className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="font-serif text-lg">{title}</h2>
      <p className="mt-1 text-xs text-ink-3">
        As respostas usam apenas documentos recuperados e mostram a fonte de cada afirmação. Não recomendamos candidatos.
        {context ? " O assistente mantém o contexto desta página." : ""}
      </p>
      <div ref={liveRef} aria-live="polite" className="mt-4 space-y-6">
        {turns.map((t) => (
          <div key={t.id}>
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="sr-only">Você perguntou: </span>
              {t.question}
            </p>
            <div className="mt-3">
              {!t.response && !t.error && <p className="text-sm text-ink-3">Buscando documentos…</p>}
              {t.error && (
                <p role="alert" className="rounded-lg bg-err-bg px-3 py-2 text-sm text-err-ink">
                  Falha técnica: {t.error}. Isso não significa que a informação não exista.
                </p>
              )}
              {t.response && <ResponseView r={t.response} anchor={`a${t.id}`} onPick={(id, name) => ask(`${t.question} — ${name}`, id)} />}
            </div>
          </div>
        ))}
      </div>
      {suggestions.length > 0 && turns.length === 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-surface-2" disabled={busy}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <label htmlFor={`ask-${context?.id ?? "geral"}`} className="sr-only">
          Sua pergunta
        </label>
        <input
          id={`ask-${context?.id ?? "geral"}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1000}
          placeholder={context ? "Pergunte sobre este conteúdo…" : "Faça uma pergunta…"}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
        <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50">
          {busy ? "…" : "Enviar"}
        </button>
      </form>
    </section>
  );
}

function ResponseView({ r, anchor, onPick }: { r: AssistantResponse; anchor: string; onPick: (id: string, name: string) => void }) {
  return (
    <div className="space-y-3 text-sm">
      {r.notices.map((n, i) => (
        <p key={i} className="rounded-lg bg-surface-2 px-3 py-2 text-ink-2">
          {n}
        </p>
      ))}
      {r.mode === "gerada" && r.answer && (
        <>
          <p className={`text-base ${r.answer.situacao === "insuficiente" ? "text-ink-2" : "text-ink"}`}>
            {r.answer.situacao === "insuficiente" && <span className="font-semibold">Não foi possível verificar. </span>}
            {r.answer.respostaDireta}
          </p>
          {r.answer.explicacao.length > 0 && <ClaimList claims={r.answer.explicacao} anchorPrefix={anchor} />}
          {r.answer.ressalvas.length > 0 && (
            <div>
              <p className="font-semibold">Ressalvas</p>
              <ul className="ml-4 list-disc text-ink-2">{r.answer.ressalvas.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {r.answer.informacaoQueFalta.length > 0 && (
            <div>
              <p className="font-semibold">O que faltaria para responder melhor</p>
              <ul className="ml-4 list-disc text-ink-2">{r.answer.informacaoQueFalta.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {r.answer.aprofundar.length > 0 && (
            <div>
              <p className="font-semibold">Para aprofundar</p>
              <ul className="ml-4 list-disc text-ink-2">{r.answer.aprofundar.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
        </>
      )}
      {r.mode === "estruturada" && r.structured && (
        <div>
          <p className="text-base">
            Na base do Imparciali, <Link href={`/politicos/${r.structured.person.id}`} className="font-semibold underline">{r.structured.person.name}</Link> aparece em{" "}
            <strong>{r.structured.counts.autoria}</strong> projeto(s) como 1º signatário, <strong>{r.structured.counts.coautoria}</strong> como coautora/coautor
            {r.structured.counts.apoio ? <>, <strong>{r.structured.counts.apoio}</strong> com assinatura de apoio</> : null}
            {r.structured.counts.nao_verificado ? <> e <strong>{r.structured.counts.nao_verificado}</strong> com papel não verificado</> : null}
            {r.structured.topic ? <> no tema <strong>{r.structured.topic.name}</strong></> : null}.
          </p>
          <p className="mt-1 text-xs text-ink-3">{r.structured.coverage}</p>
          {r.structured.sample.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {r.structured.sample.map((s) => (
                <li key={s.id}>
                  <Link href={`/projetos/${s.id}`} className="font-medium underline">{s.label}</Link>{" "}
                  <span className="text-ink-3">({ROLE_LABEL[s.role]}{s.presentedAt ? `, ${formatDate(s.presentedAt)}` : ""})</span> — {s.ementa}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {(r.mode === "editorial" || r.mode === "sem_cobertura") && r.editorial && r.editorial.length > 0 && (
        <div className="space-y-2">
          {r.editorial.map((g) => (
            <div key={g.slug} className="rounded-lg border border-line p-3">
              <p className="font-semibold">{g.term}</p>
              <p className="mt-1">{g.short}</p>
              <p className="mt-1 text-ink-2">{g.long}</p>
              {g.reference && <p className="mt-1 text-xs text-ink-3">Referência: {g.reference}</p>}
            </div>
          ))}
        </div>
      )}
      {r.mode === "desambiguacao" && r.candidates && (
        <ul className="space-y-2">
          {r.candidates.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
              <div>
                <Link href={`/politicos/${c.id}`} className="font-semibold underline">{c.name}</Link>
                <p className="text-xs text-ink-3">
                  {c.mandates.length
                    ? c.mandates.map((m) => `Deputado(a) federal ${m.uf} · ${m.legislature}ª legislatura (${m.startDate?.slice(0, 4)}–${m.endDate?.slice(0, 4)})`).join("; ")
                    : "Sem mandato sincronizado"}
                  {c.lastKnownParty ? ` · último partido informado: ${c.lastKnownParty}` : ""} · ID Câmara {c.camaraId ?? "—"}
                </p>
              </div>
              <button type="button" className="rounded-lg border border-line px-2 py-1 text-xs" onClick={() => onPick(c.id, `${c.name} (ID Câmara ${c.camaraId ?? "—"})`)}>
                É esta pessoa
              </button>
            </li>
          ))}
        </ul>
      )}
      <EvidenceList evidence={r.evidence} anchorPrefix={anchor} title={r.mode === "somente_evidencias" || r.mode === "erro" ? "Documentos encontrados" : "Fontes usadas"} />
    </div>
  );
}
