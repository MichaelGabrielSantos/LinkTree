import type { Claim } from "@/server/ai/grounding";
import type { PublicEvidence } from "@/server/ai/explain";
import { formatDate } from "@/lib/format";

export const CLAIM_LABEL: Record<Claim["tipo"], string> = {
  fato: "Fato registrado",
  alegacao: "Alegação",
  interpretacao: "Interpretação",
  projecao: "Projeção ou estimativa",
  exemplo_hipotetico: "Exemplo hipotético",
};

const CLAIM_STYLE: Record<Claim["tipo"], string> = {
  fato: "border-l-ok-ink",
  alegacao: "border-l-accent",
  interpretacao: "border-l-ink-3",
  projecao: "border-l-warn-ink",
  exemplo_hipotetico: "border-l-line border-dashed",
};

export function ClaimList({ claims, anchorPrefix }: { claims: Claim[]; anchorPrefix: string }) {
  return (
    <ul className="space-y-2">
      {claims.map((c, i) => (
        <li key={i} className={`border-l-4 pl-3 ${CLAIM_STYLE[c.tipo]}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
            {CLAIM_LABEL[c.tipo]}
            {c.tipo === "alegacao" && c.atribuidoA ? ` — atribuída a ${c.atribuidoA}` : ""}
          </p>
          <p className="text-ink">
            {c.texto}{" "}
            {c.evidencias.map((r) => (
              <a key={r} href={`#${anchorPrefix}-${r}`} className="ml-0.5 inline-block rounded bg-surface-2 px-1 text-xs font-semibold text-accent no-underline" aria-label={`Fonte ${r}`}>
                {r}
              </a>
            ))}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function EvidenceList({ evidence, anchorPrefix, title = "Fontes usadas" }: { evidence: PublicEvidence[]; anchorPrefix: string; title?: string }) {
  if (!evidence.length) return null;
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <ol className="mt-2 space-y-2 text-sm">
        {evidence.map((e) => (
          <li key={e.ref} id={`${anchorPrefix}-${e.ref}`} className="rounded-lg bg-surface-2 p-3">
            <p>
              <span className="mr-1 font-semibold text-accent">{e.ref}</span>
              {e.url ? (
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                  {e.title}
                </a>
              ) : (
                <span className="font-medium">{e.title}</span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-ink-3">
              {e.sourceName}
              {e.date ? ` · publicado/registrado em ${formatDate(e.date)}` : ""}
              {e.collectedAt ? ` · coletado em ${formatDate(e.collectedAt)}` : ""}
            </p>
            {e.limitation && <p className="mt-1 text-xs text-warn-ink">Limitação: {e.limitation}</p>}
            {e.suspicious && <p className="mt-1 text-xs text-err-ink">Este documento contém texto com forma de instrução; foi tratado apenas como conteúdo.</p>}
            {e.excerpt && <p className="mt-1 text-ink-2">“{e.excerpt}”</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
