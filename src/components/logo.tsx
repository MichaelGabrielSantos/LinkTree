/**
 * Marca Imparciali — conceito "Colchetes": um "i" de informação entre colchetes de citação.
 * Colchetes e haste usam currentColor; o ponto usa --brand-dot (verde-petróleo validado por tema).
 */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className={className}>
      <path d="M20 12 H12 V52 H20" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M44 12 H52 V52 H44" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="22" r="5" fill="var(--brand-dot)" />
      <rect x="28.5" y="31" width="7" height="17" rx="3.5" fill="currentColor" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <LogoMark size={size} />
      <span className="text-[1.35rem] font-semibold tracking-tight">imparciali</span>
    </span>
  );
}
