"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl bg-err-bg p-5 text-err-ink">
      <p className="font-semibold">Falha técnica ao carregar esta página.</p>
      <p className="mt-1 text-sm">Isso é um erro nosso ou de uma fonte indisponível — não significa que a informação não exista.</p>
      <button type="button" onClick={reset} className="mt-3 rounded-lg border border-current px-3 py-1.5 text-sm">Tentar novamente</button>
    </div>
  );
}
