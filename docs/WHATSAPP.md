# Imparciali no WhatsApp — plano

> Status: planejamento. Nada disto está implementado. Pesquisa feita em 19/10/2026.

## 1. Veredito

**O bot oficial (WhatsApp Business Platform) provavelmente está vetado para o Imparciali hoje.** A Política de Mensagens Comerciais do WhatsApp diz, na seção *Policy on Government and Political Use*:

> "We prohibit the use of the WhatsApp Business Platform by Political Parties, Politicians, Political Candidates, and Political Campaigns."
> "We prohibit the use of the WhatsApp Business Platform by entities that offer services related to politics"

Um serviço que acompanha parlamentares, gastos e projetos se encaixa, numa leitura literal, em "entidades que oferecem serviços relacionados à política". Em 2024, deputados brasileiros discutiram esse veto com a Meta ([Aos Fatos](https://www.aosfatos.org/noticias/deputados-reuniao-whatsapp/)).

Há mais duas travas:

- **IA de propósito geral:** desde 15/01/2026, os termos da plataforma barram provedores cuja IA é a função principal do serviço. A Meta decide o que conta como função principal ([TechCrunch](https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform)). Um assistente de perguntas e respostas sobre política fica numa zona cinzenta.
- **Organizações de notícias:** "Organizations that primarily publish news content must be registered as a News Page through Facebook."

**Não usar APIs não oficiais** (Baileys, "WhatsApp Web automatizado" e serviços que revendem isso). Elas violam os termos do WhatsApp, o número pode ser banido sem aviso e, para um produto cuja marca é confiança, ser pego driblando regra é dano permanente.

## 2. O plano em fases

### Fase 0 — Compartilhar no WhatsApp (sem risco, alto impacto)

O WhatsApp é onde notícia política circula no Brasil, quase sempre sem fonte nem data. A contribuição mais valiosa do Imparciali é fazer **o que é compartilhado carregar a fonte e o contexto**.

- **Botão "Compartilhar"** em notícias, projetos e perfis. Abre `https://wa.me/?text=…` com um texto pronto:
  ```
  *PL 5498/2026* — Proteção de crianças nas redes sociais
  Situação: em análise nas comissões. ⚠️ Ainda não é lei.
  Fonte: Câmara dos Deputados, atualizado em 18/10/2026
  https://imparciali.com.br/p/2647228
  ```
- **Prévia do link (Open Graph):** uma imagem gerada por página (`next/og`), com título, situação ("Ainda não é lei" ou "Virou lei"), barra de etapas, fonte e data. Quem recebe vê o contexto mesmo sem abrir o link.
- **Regra editorial:** o texto compartilhado nunca omite fonte e data. Em projetos, sempre diz a etapa. Em gastos, sempre lembra que "usar a cota não é irregularidade".
- **Links curtos estáveis** (`/p/{id}`, `/d/{id}`, `/n/{id}`) com UTM para medir uso. A medição é agregada, sem identificar quem compartilhou.

Esforço: 2 a 3 dias. Dependências: nenhuma.

### Fase 1 — Canal do WhatsApp (resumo diário, um para muitos)

Os Canais são transmissões unidirecionais, abertas a qualquer pessoa e sem conversa. Não usam a Business Platform, então a política acima não se aplica a eles. Valem as Diretrizes de Canais, que precisam ser revisadas antes do lançamento.

- **1 post por dia** com o resumo da edição diária: 3 a 5 itens com link, mais "No Congresso".
- **Geração automática, publicação manual:** o painel `/admin/canal` monta o texto pronto, com limite de tamanho, links e fontes, e uma pessoa da equipe revisa e publica. Não encontramos API oficial de publicação em Canais (a confirmar). Para a fase 1, a revisão humana é desejável de qualquer forma.
- **Sem personalização:** todo mundo recebe o mesmo conteúdo. Para alertas por pessoa ou tema, ver a fase 2 ou as alternativas.

Esforço: 2 dias de produto, mais 15 minutos por dia de operação.

### Fase 2 — Bot conversacional oficial (condicionada)

**Só começa com resposta por escrito da Meta**, obtida por um BSP (provedor oficial) ou pelo suporte do Meta Business, confirmando que um serviço de informação cívica apartidário não se enquadra em "services related to politics" e que o assistente é "incidental".

**Funções**
- Menu: *Hoje* · *Buscar político* · *Projeto (ex.: PL 5498/2026)* · *Perguntar* · *Meus alertas* · *Sair*.
- **Respostas curtas** (até ~700 caracteres), com o link "ver fontes" para a página completa. Toda afirmação gerada por IA passa pelo mesmo validador do site, e a contagem de projetos e gastos continua sendo consulta ao banco.
- **Alertas:** novo projeto ou mudança de etapa de quem a pessoa segue; resumo diário ou semanal.

**Regras da plataforma**
- **Opt-in duplo:** a pessoa informa o número no site, confirma pelo WhatsApp e o consentimento fica registrado (tabela `consents`, `kind = "whatsapp"`). *SAIR* cancela tudo na hora.
- **Janela de 24 h:** respostas a quem escreveu são mensagens de atendimento. Alertas fora da janela exigem templates aprovados (categoria *utility*), cobrados por mensagem. A Meta prevê cobrança local para o Brasil no 2º semestre de 2026 ([preços oficiais](https://developers.facebook.com/docs/whatsapp/pricing)). Os valores precisam ser confirmados na tabela vigente.
- **Caminho para humano** é obrigatório quando há automação: *falar com a equipe* leva a um e-mail ou formulário.

**Arquitetura (reaproveita o que existe)**
```
WhatsApp Cloud API ──▶ POST /api/whatsapp/webhook  (valida X-Hub-Signature-256, responde 200 em < 1 s)
                          └─▶ fila (tabela jobs) ──▶ worker: roteia comando
                                                     ├─ consultas estruturadas (search, person, proposition, finance)
                                                     ├─ askAssistant() + validador de citações
                                                     └─ envia resposta (Graph API)
Agendador (Actions) ──▶ alertas do dia ──▶ templates utility (só para quem fez opt-in)
```
- Tabelas novas: `whatsapp_contacts` (telefone **cifrado** em repouso, status, preferências), `whatsapp_messages` (log mínimo de 30 dias, sem o texto da pergunta depois disso) e `jobs`.
- Texto da pessoa = dado não confiável (prompt injection): mesmas defesas do site e limite de mensagens por número.

**Privacidade (LGPD)**
- Telefone é dado pessoal. **Quem a pessoa segue pode revelar opinião política, que é dado sensível** (LGPD, art. 5º, II). Por isso: consentimento específico e destacado, finalidade única (alertas), nada de cruzar com outros dados e exclusão a qualquer momento.

Esforço estimado: 3 a 4 semanas, depois da aprovação.

### Alternativas se a Meta negar

1. **Telegram:** bot oficial sem essa restrição, com o mesmo backend da fase 2. Alcance menor no Brasil, mas é o caminho viável para conversa e alertas personalizados.
2. **Notificações push na web** (PWA instalável): alertas sem intermediário.
3. **E-mail:** a newsletter já planejada no incremento 2.

## 3. Calendário e eleições

- **O 2º turno é em 25/10/2026.** Não lançar nada de alertas políticos em massa no período eleitoral. As regras do TSE sobre disparo em massa e conteúdo gerado por IA (Res. 23.610/2019 e alterações) precisam de revisão jurídica antes de qualquer envio automatizado com conteúdo político.
- **Sugestão:** fase 0 agora; fase 1 depois do 2º turno; consulta à Meta em paralelo.

## 4. Como medir

- Fase 0: compartilhamentos por página e taxa de clique dos links compartilhados.
- Fase 1: seguidores do Canal e cliques por post (via UTM).
- Fase 2: opt-ins, cancelamentos (taxa de *SAIR*), perguntas respondidas × abstenções e custo por usuário ativo.

## 5. Decisões que são suas

1. Aprovar a fase 0 já.
2. Quem publica no Canal (fase 1) e em qual horário.
3. Abrir a consulta à Meta: exige uma empresa com CNPJ e Meta Business verificado.
4. Se a Meta negar: Telegram sim ou não.
