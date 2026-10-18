export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-3">
      <p className="sr-only">Carregando…</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}
