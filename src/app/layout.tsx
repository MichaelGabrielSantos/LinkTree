import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { DesktopNav, MobileNav } from "@/components/nav";
import { ThemeToggle, themeInitScript } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: { default: "Contexto", template: "%s · Contexto" },
  description: "Entenda o que aconteceu, encontre a evidência e aprofunde no seu ritmo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#121315" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen">
        <a href="#conteudo" className="skip-link">
          Pular para o conteúdo
        </a>
        <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
            <Link href="/" className="font-serif text-xl font-semibold tracking-tight text-ink">
              Contexto
            </Link>
            <DesktopNav />
            <form action="/explorar" role="search" className="ml-auto flex min-w-0 flex-1 justify-end md:max-w-xs">
              <label htmlFor="busca-global" className="sr-only">
                Pesquisar notícias, políticos e projetos
              </label>
              <input
                id="busca-global"
                name="q"
                type="search"
                placeholder="Pesquisar ou perguntar…"
                className="w-full min-w-0 rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-ink placeholder:text-ink-3"
              />
            </form>
            <ThemeToggle />
          </div>
        </header>
        <main id="conteudo" className="mx-auto max-w-5xl px-4 pb-28 pt-6 md:pb-16">
          {children}
        </main>
        <footer className="mx-auto max-w-5xl border-t border-line px-4 pb-28 pt-6 text-sm text-ink-3 md:pb-10">
          <p>
            Versão inicial com cobertura limitada: Câmara dos Deputados (dados abertos) e Agência Brasil (trechos de RSS). A ordenação do
            panorama é uma escolha editorial do produto, não uma verdade objetiva.
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/metodologia" className="underline">Metodologia e fontes</Link>
            <Link href="/metodologia#glossario" className="underline">Glossário</Link>
            <Link href="/cobertura" className="underline">Cobertura de cargos</Link>
          </p>
        </footer>
        <MobileNav />
      </body>
    </html>
  );
}
