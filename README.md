# Contexto

> Entenda o que aconteceu, encontre a evidência e aprofunde no seu ritmo.

Aplicação web para pessoas brasileiras descobrirem notícias, pesquisarem assuntos, entenderem informações complexas e acompanharem a atuação de parlamentares. Cada afirmação gerada por IA aponta para um documento recuperado.

**Estado atual: incremento 1 (núcleo verificável) implementado.** Não é o produto completo. Senado, votações, resumo diário, newsletter e o teste de posicionamento são dos incrementos seguintes (ver [docs/PLANO.md](docs/PLANO.md)).

---

## O que funciona hoje

| Área | Funcionalidade | Dados |
|---|---|---|
| **Hoje** | Panorama geral com ordenação auditável (fórmula pública em `/metodologia`), ordem cronológica, filtros de período/tema/fonte, agrupamento de matérias sobre o mesmo acontecimento, "Seus interesses" com motivo explícito | Agência Brasil (RSS real, 11 editorias) |
| **Explorar** | Busca global com abas Tudo / Notícias / Políticos / Projetos; filtros por aba preservados na URL; reconhecimento de identificadores ("PL 5498/2026"); desambiguação de homônimos com cargo, UF, legislatura e ID oficial | Câmara + Agência Brasil |
| **Político** | Perfil com foto (com origem), mandatos, partidos **por período** (sem aplicar o partido atual ao passado), proposições separadas por papel (autoria / coautoria / apoiamento / não verificado), filtros por tipo e tema, relatorias (último relator) separadas de autoria, notícias que mencionam o nome (com aviso de homônimos), cobertura explícita | Câmara (API + arquivos anuais 2019–2026) |
| **Projeto** | Identificação, ementa, etapa legislativa explicada (aprovado em comissão ≠ lei), autoria, relatoria, temas, tramitação completa com etapas classificadas, apensados, versões preservadas, link ao inteiro teor | Câmara (API, sincronização sob demanda com limite de tempo) |
| **Notícia** | Trecho da fonte com atribuição, link ao original, linha do tempo do acontecimento, "o que mudou desde a última atualização" (diff de versões), explicações sob demanda | Agência Brasil |
| **Explicações e assistente** | Explicar / mais simples / exemplo do cotidiano / argumentos documentados / explicar termo; chat contextual (notícia, projeto ou político) com fontes por afirmação; consultas estruturadas para contagens; glossário editorial para conceitos | Provedor de IA substituível (Anthropic) — **ver limitações** |
| **Acompanhando** | Seguir políticos, temas e projetos; atualizações separadas por tipo (notícia, novo projeto, tramitação, atualização da fonte), agrupadas, janela diária ou semanal | — |
| **Perfil** | Conta opcional (leitura é livre), preferências de temas, salvos, histórico privado de perguntas com exclusão, exclusão de conta | — |
| **Metodologia** | Princípios, fórmula do panorama e pesos por tema, catálogo de fontes com termos consultados e operações permitidas, uso de IA, glossário, pendências | — |
| **Admin** (`/admin`) | Saúde dos conectores, atrasos, falhas, custo estimado de IA, explicações em cache, interesse por cargos sem cobertura, auditoria | — |

## Arquitetura

```
src/
  domain/        regras puras e testáveis: etapas legislativas, papéis de autoria, ranking, agrupamento, histórico partidário, glossário
  server/
    db/          esquema Drizzle (PostgreSQL), cliente, catálogo de fontes e temas (seed)
    connectors/  http com allowlist/backoff/retentativas; camara/ (API v2 + arquivos anuais + inteiro teor); agencia-brasil/ (RSS)
    ingestion/   execuções registradas, checkpoints, registro de jobs
    queries/     acesso a dados para a interface (busca, notícias, pessoa, proposição, acompanhamento)
    ai/          provedor substituível, evidências, regras de ancoragem, validador de citações, explicações, assistente, orçamento
    auth.ts      contas (scrypt), sessões em cookie httpOnly
    user-data.ts acompanhamentos, salvos, preferências, histórico — sempre filtrados pelo usuário da sessão
  app/           páginas (App Router) e rotas de API
  components/    interface
drizzle/         migrações SQL versionadas
scripts/         migrate, ingest (CLI), eval-ai
evals/           casos de avaliação da IA (fixtures sintéticas)
tests/           unidade + integração com PostgreSQL
```

Decisões principais:

- **Next.js 16 + TypeScript + PostgreSQL 16 + Drizzle.** Não há microserviços. A ingestão roda por CLI ou por rota agendada.
- **Busca:** full-text em português com `unaccent` (via wrapper imutável) e `pg_trgm` para nomes. **Não há pgvector**: a busca semântica ainda não se justifica, porque o volume de texto autorizado é pequeno (só trechos de RSS).
- **Ingestão separada da geração.** Os conectores coletam, validam o esquema (Zod), versionam por hash estável e nunca apagam dados válidos em caso de falha. A IA só lê o que já foi coletado e autorizado.
- **Contagens são consultas SQL**, nunca cálculo do modelo.
- **Identidades por ID oficial.** Pessoas nunca são unidas por nome; há homônimos reais na base (ex.: dois "João Carlos Bacelar" com IDs diferentes na Câmara).
- **Segredos só no servidor.** O módulo de IA importa `server-only`, a chave vem de variável de ambiente e nunca vai para o bundle nem para o navegador.

## Como executar

Requisitos: Node 22+, PostgreSQL 16+ com as extensões `unaccent` e `pg_trgm` disponíveis. A migração as cria, o que exige um papel com permissão para isso.

```bash
npm install
cp .env.example .env           # ajuste DATABASE_URL; AI_PROVIDER=none funciona sem chave
npm run db:migrate             # aplica migrações e atualiza catálogo de fontes/temas

# Ingestão (dados reais)
npm run ingest -- deputados                     # deputados das legislaturas 57 e 56 (~35 s)
NODE_OPTIONS=--max-old-space-size=8192 \
  npm run ingest -- proposicoes-anuais 2026 2025 2024 2023 2022 2021 2020 2019   # ~5 min no total
npm run ingest -- noticias                      # RSS da Agência Brasil (~5 s)
npm run ingest -- deputado 204534               # detalhe + histórico completo de um deputado via API
npm run ingest -- proposicao 2647228            # detalhe + tramitação de uma proposição
npm run ingest -- seguidos                      # atualiza deputados que alguém segue

npm run dev                    # http://localhost:3000
```

Agendamento recomendado:

| Job | Frequência | Como |
|---|---|---|
| `noticias` | 30 min | `GET /api/cron/ingest?job=noticias` com `Authorization: Bearer $CRON_SECRET` |
| `deputados`, `seguidos` | diária | rota acima (`job=deputados` / `job=seguidos`) |
| `proposicoes-anuais <ano corrente>` | diária | CLI (pesado demais para requisição web). Usa `If-Modified-Since`: sem mudança, não reprocessa |

Administração: inclua seu e-mail em `ADMIN_EMAILS` **antes** de criar a conta.

### IA

- `AI_PROVIDER=none` (padrão): o produto mostra os registros da fonte e diz que não há texto gerado. Nada é inventado.
- `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`: as explicações e o assistente usam o SDK oficial com saída estruturada (JSON validado por Zod) e `fallbacks: "default"` em caso de recusa por política. O modelo é configurável em `AI_MODEL` (padrão `claude-opus-5-5`). Para baixar custo, avalie `claude-sonnet-5-5` contra a avaliação abaixo antes de trocar.
- Limites: `AI_DAILY_CALL_LIMIT` (global) e `AI_HOURLY_LIMIT_PER_CLIENT` (por pessoa ou IP).
- Explicações públicas ficam em cache por versão das fontes. Se a fonte muda, a explicação antiga deixa de ser usada.

## Testes

```bash
createdb contexto_test && DATABASE_URL=postgres://…/contexto_test npm run db:migrate
npm test          # 46 testes (unidade + integração com PostgreSQL)
npm run typecheck
npm run eval:ai   # avaliação da IA: só mede com provedor configurado (custa chamadas reais)
```

Cobertura dos critérios de aceitação (seção 13 do briefing):

| Critério | Onde |
|---|---|
| Homônimos não são unidos; busca pede desambiguação | `tests/integration.test.ts` (homônimos, desambiguação) |
| Projeto vinculado ao autor certo; papéis autoria/coautoria/apoio | `tests/domain.test.ts` (`roleOf`), integração (contagem estruturada) |
| Simplificação não transforma projeção em fato | `tests/grounding.test.ts` |
| Abstenção sem evidência; "não encontrei ≠ não existe" | integração (`sem_resultado`), grounding (rebaixa para insuficiente) |
| Citações existem e sustentam (refs inexistentes, números inventados, URLs) | `tests/grounding.test.ts` |
| Aprovado em comissão não aparece como lei | `tests/domain.test.ts` |
| Voto em requerimento ≠ mérito; falta de voto ≠ ausência | Votações ainda não integradas. O assistente responde "sem cobertura" e não infere votos (teste de integração). As regras ficam para o incremento 2 |
| Fonte atualizada invalida resumo antigo | integração (cache por versão) |
| Falha de conector mantém dados | integração (RSS com falha) |
| Ingestão repetida não duplica e preserva versões | integração (notícias e proposições) |
| Dados privados não vazam entre usuários | integração (isolamento) |
| Instrução maliciosa em documento não altera o assistente | grounding (neutralização do envelope) + integração (modelo FIXTURE "obediente" é barrado pelo validador) |
| Layout celular/desktop sem rolagem horizontal | verificado com Playwright (390 px e 1280 px, claro e escuro) |
| Teste político / newsletter | Incrementos 3 e 2 |

## Integrações verificadas (2026-10-18) e limitações

- **Câmara dos Deputados (ativa).** API v2 e arquivos anuais verificados contra o swagger oficial. Na base de desenvolvimento: 412.946 proposições (2019–2026), 773.467 vínculos de autoria e 1.313 pessoas.
  - A API devolve CPF no detalhe do deputado; **não armazenamos**.
  - O PDF do inteiro teor em `www.camara.leg.br` responde **HTTP 429 para clientes identificados como robô**. **Não contornamos o bloqueio** (não disfarçamos o user-agent). Na prática, as explicações de projetos usam só ementa e metadados, e dizem isso. Pendência: pedir à Câmara um meio oficial de coleta.
  - Os termos de uso específicos não puderam ser lidos (a página depende de JavaScript).
- **Agência Brasil (restrita).** A política autoriza reprodução "para veículos de comunicação com fins jornalísticos, mediante indicação da fonte"; o uso comercial exige licença. Como o enquadramento do Contexto não foi confirmado, **guardamos e mostramos só o trecho inicial (≤ 600 caracteres)**, não reproduzimos imagens e removemos os pixels de rastreamento do feed. Não há feed de ciência e tecnologia.
- **IA:** o caminho com o modelo real **não foi exercitado neste ambiente** (sem chave). O pipeline foi testado com um provedor FIXTURE determinístico. Rode `npm run eval:ai` com chave antes de produção.
- **Senado, TSE, Portal da Transparência:** catalogados como pendentes. A disponibilidade do Senado foi verificada; a integração fica para o próximo incremento.

## Pendências antes de produção

- Revisão jurídica do uso da Agência Brasil e de privacidade (LGPD: bases legais, retenção do histórico, política de privacidade). Não alegamos conformidade.
- Revisão do glossário e das regras de etapas legislativas por especialista.
- Execução da avaliação de IA com o modelo real e revisão humana das respostas.
- Rate limit é por janela no banco. Para tráfego alto, mover para um armazenamento dedicado.
