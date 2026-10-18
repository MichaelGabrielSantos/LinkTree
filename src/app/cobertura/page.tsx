import type { Metadata } from "next";
import { coverageInterestAction } from "@/app/actions";
import { Card, Notice, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Cobertura de cargos" };

const OFFICES = [
  { office: "Deputado(a) federal", status: "Coberto", detail: "Legislaturas 56 e 57 (2019–2027): perfil, partidos por período, proposições (autoria, coautoria, apoiamento), relatorias atuais, tramitação. Votações: próximo incremento." },
  { office: "Senador(a)", status: "Próximo incremento", detail: "API do Senado verificada; integração prevista no incremento 2." },
  { office: "Presidente e ministros (Executivo federal)", status: "Sem conector", detail: "Sem fonte integrada." },
  { office: "Governador(a) e deputado(a) estadual", status: "Sem conector", detail: "Não há fonte nacional única; exige integração por estado." },
  { office: "Prefeito(a) e vereador(a)", status: "Sem conector", detail: "Não há fonte nacional única; exige integração por município." },
];

export default async function CoberturaPage({ searchParams }: { searchParams: Promise<{ registrado?: string; limite?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Cobertura de cargos">O que o Contexto acompanha hoje — e o que ainda não. Não simulamos dados para cargos sem fonte integrada.</PageHeader>
      {sp.registrado && <Notice tone="ok">Interesse registrado. Obrigado!</Notice>}
      {sp.limite && <Notice tone="warn">Muitos registros a partir desta conexão. Tente mais tarde.</Notice>}
      <div className="mt-4 space-y-3">
        {OFFICES.map((o) => (
          <Card key={o.office}>
            <p className="font-semibold">{o.office} <span className="ml-2 text-sm font-normal text-ink-3">{o.status}</span></p>
            <p className="mt-1 text-sm text-ink-2">{o.detail}</p>
            {o.status !== "Coberto" && (
              <form action={coverageInterestAction} className="mt-2 flex flex-wrap items-end gap-2 text-sm">
                <input type="hidden" name="office" value={o.office} />
                <label className="flex flex-col gap-1"><span className="text-ink-3">UF (opcional)</span><input name="uf" maxLength={2} className="w-16 rounded-lg border border-line bg-surface px-2 py-1 uppercase" /></label>
                <button className="rounded-lg border border-line px-3 py-1.5">Tenho interesse</button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
