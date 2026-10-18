# Plano do produto completo

O incremento 1 está implementado (ver README). Este documento registra o desenho dos incrementos seguintes, para que o que já existe não precise ser refeito.

## Incremento 2 — acompanhamento diário

### Senado
- Conector `src/server/connectors/senado/` sobre `https://legis.senado.leg.br/dadosabertos/` (disponibilidade verificada em 2026-10-18; ler a documentação e os termos antes de codificar endpoints).
- `person_external_ids.system = "senado"` já existe no esquema. Correspondência Câmara↔Senado (quem foi deputado e virou senador) **só por tabela verificada** (`method = "tabela_verificada"`), nunca por nome.
- `mandates.office = "senador"` já previsto.

### Votações
Novas tabelas (migração nova):
- `votes_sessions` (votação): `externalId`, órgão, data, `objeto` (texto da fonte), `objetoTipo` (`merito` | `requerimento` | `destaque` | `emenda` | `redacao_final` | `desconhecido`), `natureza` (`nominal` | `simbolica` | `secreta`), resultado, proposição afetada (FK) e proposição principal.
- `vote_records`: votação × pessoa × voto registrado (`sim` | `nao` | `abstencao` | `obstrucao` | `artigo17`). **Sem linha quando não há registro.**

Regras de domínio (testes obrigatórios antes de exibir):
- Votação simbólica ou secreta → a interface mostra só o resultado e nunca um voto individual.
- Sem registro de voto → "sem voto registrado", nunca "ausente" nem "contra".
- `objetoTipo ≠ merito` → rótulo explícito ("voto em requerimento de urgência", não "voto no projeto").
- Várias votações da mesma proposta não viram "várias leis". Agrupar por proposição principal.
- Quando o objeto não estiver claro (`desconhecido`), buscar documentos complementares (pauta, `/votacoes/{id}`) antes de gerar qualquer interpretação, e marcar a limitação.

### Resumo diário no app
- Tabela `daily_editions` (data em America/Sao_Paulo, versão, itens com referências a `news_articles`/`propositions`/`tramitacoes`, status).
- Montagem determinística: panorama (mesma fórmula de `/metodologia`), temas e pessoas seguidos, atualizações. A explicação educativa curta sai do glossário ou de uma explicação já validada. **Se não há novidade verificável, a edição diz isso** e não completa espaço.

### Newsletter
- `consents` já existe (append-only). Novas tabelas: `subscriptions` (temas, frequência, horário, token de cancelamento) e `deliveries` (edição × assinatura × status).
- Inscrição explícita, separada do cadastro. Prévia antes de confirmar. Cancelamento em um clique (link com token).
- Envio por provedor configurável com `EMAIL_TRANSPORT=log` como padrão: **nenhum e-mail real sai em desenvolvimento ou testes**.

### Correções
- Mudança detectada em notícia ou proposição já gera nova versão. Falta: tabela `corrections` (o que mudou, páginas afetadas), selo nas páginas e menção na próxima edição quando a mudança for relevante (critério: mudança de título, número ou etapa legislativa).

## Incremento 3 — expansão

### Teste educativo de posicionamento

Princípios: opcional, autorrelato, sem conta, **resultado só no aparelho por padrão**, sincronização só com consentimento explícito (`consents.kind = "quiz_sync"`). Nunca entra em analytics, ordenação, recomendação ou respostas do assistente. Não há compatibilidade com políticos.

Desenho definido **antes** da implementação:
- Dimensões (não assumidas independentes nem universais): papel do Estado e organização econômica; redistribuição e políticas sociais; liberdades civis e costumes; segurança pública e garantias individuais; meio ambiente e prioridades de desenvolvimento.
- 25 afirmações na v1 (5 por dimensão), cada uma com uma única decisão. Metade formulada em cada direção, para reduzir viés de aquiescência. Revisão de linguagem por pessoas de diferentes posições antes de publicar.
- Escala: discordo totalmente (−2) … concordo totalmente (+2), mais "não sei / prefiro não responder", que **não conta como 0**: é excluída do cálculo.
- Pontuação por dimensão = média das respostas válidas, já com o sinal de cada afirmação aplicado (tabela pública `quiz_scoring_rules`).
- **Mínimo de 4 respostas válidas de 5 por dimensão**; abaixo disso, "respostas insuficientes".
- Resultado: tendência por dimensão em faixas qualitativas, sem probabilidades nem "precisão", com explicação, limitações, opção de refazer e de apagar.
- Cálculo em `src/domain/quiz.ts`, puro e determinístico, com testes. Nenhuma chamada ao modelo.
- Versionamento: `quiz_versions`, `quiz_questions`, `quiz_scoring_rules`. Resultados antigos ficam ligados à versão usada.

### Outras fontes
- TSE (candidaturas, prestação de contas), Portal da Transparência (exige chave; despesas e emendas), Banco Central e IBGE (indicadores com série e data de referência).
- Cada nova fonte entra no catálogo `sources` com termos consultados e operações permitidas **antes** de qualquer coleta.
- Outra fonte de notícias, para que o fator "alcance" do panorama discrimine e para cobrir ciência e tecnologia. Candidatas: NewsAPI (só metadados, verificar custo) e Guardian (internacional, verificar termos comerciais).

### Busca semântica
- Só se a recuperação lexical se mostrar insuficiente na avaliação (`npm run eval:ai` + casos novos). Aí, pgvector sobre trechos **autorizados** (`permissions.index ≠ "metadados"`).
