import Link from "next/link";
import { currentStage, PIPELINE, pipelineIndex, PROPOSAL_TYPE_LABEL, stageBadge, TERMINAL_STAGES, type Stage } from "@/domain/legislative-stage";
import { formatDate } from "@/lib/format";

export type PropositionCardData = {
  id: string;
  siglaTipo: string;
  numero: number;
  ano: number;
  ementa: string;
  presentedAt: Date | null;
  statusSituacao: string | null;
  statusTramitacao?: string | null;
  statusOrgao?: string | null;
  statusAt?: Date | null;
  footer?: string;
};

/** Ementa em formato de título: sem o prefixo burocrático, cortada em limite de palavra. */
export function cardTitle(ementa: string, max = 170): string {
  let t = ementa.trim().replace(/^disp[õo]e sobre\s+/i, "");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

const TONE: Record<"ok" | "neutral" | "accent", string> = {
  ok: "bg-ok-bg text-ok-ink",
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-ink",
};

export function StageProgress({ stage }: { stage: Stage }) {
  const terminal = TERMINAL_STAGES.includes(stage);
  const idx = pipelineIndex(stage);
  return (
    <div className="flex gap-1" aria-hidden>
      {PIPELINE.map((p, i) => (
        <span
          key={p.key}
          className={`h-1.5 flex-1 rounded-full ${terminal ? "bg-chart-track" : i <= idx ? (stage === "norma_juridica" ? "bg-ok-ink" : "bg-chart-1") : "bg-chart-track"}`}
        />
      ))}
    </div>
  );
}

export function PropositionCard({ p }: { p: PropositionCardData }) {
  const stage = currentStage(p.statusSituacao, p.statusTramitacao ? { descricaoTramitacao: p.statusTramitacao, siglaOrgao: p.statusOrgao } : null);
  const base = stageBadge(stage);
  const badge = stage === "norma_juridica" ? { ...base, label: ["PL", "PLP", "PLV", "MPV"].includes(p.siglaTipo) ? "Virou lei" : p.siglaTipo === "PEC" ? "Virou emenda constitucional" : base.label } : base;
  const idx = pipelineIndex(stage);
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-ink-3 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          {p.siglaTipo} {p.numero}/{p.ano}
          <span className="ml-1 font-normal normal-case tracking-normal">· {PROPOSAL_TYPE_LABEL[p.siglaTipo] ?? p.siglaTipo}</span>
        </p>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[badge.tone]}`}>
          <span aria-hidden>{badge.icon}</span>
          {badge.label}
        </span>
      </div>
      <h3 className="mt-2 line-clamp-4 font-serif text-lg leading-snug text-ink">
        <Link href={`/projetos/${p.id}`} className="after:absolute after:inset-0 after:content-['']">
          {cardTitle(p.ementa)}
        </Link>
      </h3>
      <div className="mt-auto pt-4">
        <StageProgress stage={stage} />
        <p className="mt-2 flex flex-wrap justify-between gap-x-3 text-xs text-ink-3">
          <span>
            {TERMINAL_STAGES.includes(stage) ? badge.label : idx >= 0 ? `Etapa ${idx + 1} de ${PIPELINE.length}: ${PIPELINE[idx].label}` : "Etapa não identificada"}
          </span>
          <span>{p.footer ?? (p.presentedAt ? `Apresentado em ${formatDate(p.presentedAt)}` : "")}</span>
        </p>
      </div>
    </article>
  );
}

export function PropositionGrid({ items }: { items: PropositionCardData[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((p) => (
        <li key={p.id}>
          <PropositionCard p={p} />
        </li>
      ))}
    </ul>
  );
}
