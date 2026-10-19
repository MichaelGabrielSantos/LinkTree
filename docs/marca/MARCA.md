# Marca: Imparciali

> Status: **conceito 2 (Colchetes) adotado em 19/10/2026** e aplicado no app: cabeçalho, favicon que segue o tema, ícones de app e imagem de compartilhamento. Falta: domínio, INPI e versão final do logotipo com a fonte convertida em curvas, feita por designer.

## 1. O nome — riscos antes de adotar

**O nome promete o que o próprio briefing do produto proíbe prometer.** O briefing diz: "Não prometer ausência absoluta de viés." Um app chamado *Imparciali* será cobrado por cada escolha editorial (o que entra no panorama, como um gasto é mostrado). O primeiro erro vira manchete do tipo "o 'imparcial' que não é".

**Por que dá para manter mesmo assim:** o nome é memorável e diz a aspiração em uma palavra. O risco cai se a marca tratar imparcialidade como **método verificável**, e não como atributo garantido. Por exemplo, com um slogan que aponte para o método:

- *Imparcial no método. Aberto na fonte.* (recomendado)
- *Os fatos, com a fonte.*
- *Entenda. Confira a fonte.*

**Outros pontos a checar:**

| Ponto | Situação (19/10/2026) | Ação |
|---|---|---|
| Grafia | "imparciali" vai ser digitado como "imparcial" | Registrar variações de domínio e redirecionar |
| `imparcial.com.br` | Já registrado por terceiros desde 1999 (registro.br) | Não está disponível. Quem errar a grafia cai num site de outra pessoa |
| `imparciali.com` | Não aparece no registro (RDAP Verisign 404) | Registrar já |
| `imparciali.com.br` | Consulta inconclusiva (o registro.br limitou as requisições) | Conferir no registro.br |
| Confusão com veículos existentes | Há um jornal chamado *O Imparcial* (São Luís, MA), a confirmar | Busca no INPI antes de investir |
| Marca no INPI | "Imparcial" sozinho é termo descritivo, de registro difícil; "Imparciali" é mais distintivo | Busca de anterioridade nas classes 38, 41 e 42, e depósito |
| Pronúncia | Tônica ambígua: im-par-ci-**A**-li ou im-par-ci-a-**LI**? | Definir e usar sempre igual em áudio e vídeo |

## 2. Logo — três conceitos

Ver `conceitos.png` (ícone com o nome, ícone de app e favicon, nos temas claro e escuro).

| Conceito | Ideia | Prós | Contras |
|---|---|---|---|
| **1 · Nível** | Nível de bolha centrado: mede, não opina | Metáfora original | Ícone largo: some no favicon de 16 px |
| **2 · Colchetes** | Um "i" de informação entre colchetes de citação: todo dado com a fonte | Legível em todos os tamanhos. Fala do diferencial real (fonte), não promete neutralidade. O "i" ecoa o final do nome | Menos óbvio à primeira vista |
| **3 · Equilíbrio** | Balança em forma de "i" | Entendimento imediato | Clichê de escritório de advocacia e de tribunal. Reforça a promessa arriscada. Embola no favicon |

**Recomendação: conceito 2 (Colchetes).** É o único que funciona de 16 px a outdoor, e comunica *como* o Imparciali é imparcial (citando a fonte) em vez de só afirmar que é.

### Cores

- **A marca principal é monocromática** (tinta sobre fundo claro, ou claro sobre escuro). No Brasil, quase toda cor forte lembra algum partido, então a marca não depende de cor.
- Detalhe no ponto do "i": verde-petróleo, usado só como acento (valores e contraste na seção 3).
- Nunca usar vermelho, azul ou amarelo saturados como cor de marca.

## 3. Arquivos

- `public/brand/imparciali-mark.svg` (fundo claro) e `imparciali-mark-dark.svg` (fundo escuro)
- `src/app/icon.svg`: favicon que troca de cor com o tema do sistema
- `src/app/apple-icon.png` e `public/brand/icon-*.png`: ícones de app e PWA (inclui maskable)
- `src/app/opengraph-image.png`: prévia de link (1200×630)
- `src/components/logo.tsx`: marca em React (`LogoMark`, `Logo`)
- Ponto do "i": `#0E7C6B` sobre claro (4,9:1) e `#14A08A` sobre escuro (5,7:1), os dois acima do mínimo de 3:1 para elementos gráficos

## 4. Próximos passos

1. Registrar `imparciali.com` e conferir `imparciali.com.br`.
2. Fazer a busca no INPI.
3. Encomendar a versão final do logotipo, com a fonte em curvas, para não depender da fonte instalada no aparelho.
