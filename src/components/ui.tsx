import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{eyebrow}</p>}
      <h1 className="mt-1 font-serif text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
      {children && <div className="mt-2 text-ink-2">{children}</div>}
    </header>
  );
}

export function Card({ children, className = "", as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "article" | "section" | "li" }) {
  return <As className={`rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5 ${className}`}>{children}</As>;
}

type NoticeTone = "info" | "warn" | "error" | "ok";
const toneClass: Record<NoticeTone, string> = {
  info: "bg-accent-soft text-ink",
  warn: "bg-warn-bg text-warn-ink",
  error: "bg-err-bg text-err-ink",
  ok: "bg-ok-bg text-ok-ink",
};
const toneLabel: Record<NoticeTone, string> = { info: "Informação", warn: "Atenção", error: "Erro", ok: "Ok" };

export function Notice({ tone = "info", title, children }: { tone?: NoticeTone; title?: string; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg px-4 py-3 text-sm ${toneClass[tone]}`}>
      <span className="sr-only">{toneLabel[tone]}: </span>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-1" : ""}>{children}</div>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" | "ok" }) {
  const cls =
    tone === "accent" ? "bg-accent-soft text-ink" : tone === "warn" ? "bg-warn-bg text-warn-ink" : tone === "ok" ? "bg-ok-bg text-ok-ink" : "bg-surface-2 text-ink-2";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
      <p className="font-serif text-lg text-ink">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function Tabs({ items, current }: { items: Array<{ key: string; label: string; href: string; count?: number }>; current: string }) {
  return (
    <nav aria-label="Abas de resultado" className="-mx-4 mb-4 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b border-line">
        {items.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={t.key === current ? "page" : undefined}
              className={`inline-block whitespace-nowrap border-b-2 px-3 py-2 text-sm ${t.key === current ? "border-accent font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
            >
              {t.label}
              {typeof t.count === "number" && <span className="ml-1 text-ink-3">({t.count})</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SectionTitle({ id, children, aside }: { id?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-3">
      <h2 id={id} className="font-serif text-xl text-ink">
        {children}
      </h2>
      {aside && <div className="text-sm text-ink-3">{aside}</div>}
    </div>
  );
}

export const buttonClass =
  "inline-flex items-center justify-center gap-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50";
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50";
export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-3 focus:border-accent";

/** Explicação metodológica recolhida: disponível, mas sem poluir a leitura. */
export function AboutData({ title = "Sobre estes dados", children }: { title?: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl bg-surface-2 px-4 py-2 text-sm text-ink-2">
      <summary className="cursor-pointer list-none py-1 font-medium text-ink-2 marker:hidden">
        <span aria-hidden className="mr-1 inline-block transition group-open:rotate-90">›</span>
        {title}
      </summary>
      <div className="space-y-1 pb-2 pt-1">{children}</div>
    </details>
  );
}

export function StatTile({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const inner = (
    <>
      <p className="text-sm text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </>
  );
  const cls = "block rounded-2xl border border-line bg-surface p-4 shadow-card";
  return href ? <Link href={href} className={`${cls} hover:border-accent`}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

/** Linha de opções em formato de pílulas (substitui selects para escolhas curtas). */
export function ChipNav({ label, items }: { label: string; items: Array<{ key: string; label: ReactNode; href: string; active: boolean }> }) {
  return (
    <nav aria-label={label} className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2 pb-1">
        {items.map((i) => (
          <li key={i.key} className="shrink-0">
            <Link
              href={i.href}
              aria-current={i.active ? "true" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition ${
                i.active ? "border-accent bg-accent font-semibold text-accent-ink" : "border-line bg-surface text-ink-2 hover:border-ink-3 hover:text-ink"
              }`}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export const TOPIC_ICON: Record<string, string> = {
  politica: "🏛️",
  economia: "💰",
  brasil: "📍",
  mundo: "🌎",
  saude: "🩺",
  educacao: "🎓",
  "meio-ambiente": "🌿",
  justica: "⚖️",
  "direitos-humanos": "🤝",
  "ciencia-tecnologia": "🔬",
  cultura: "🎭",
  esportes: "⚽",
  agro: "🌾",
};

export function TopicIcon({ slug }: { slug: string | null | undefined }) {
  if (!slug || !TOPIC_ICON[slug]) return null;
  return <span aria-hidden>{TOPIC_ICON[slug]}</span>;
}
