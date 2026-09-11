# Phase 0 Research: Bot de Atendimento Financeiro via Telegram

Nenhum item do Technical Context ficou marcado como `NEEDS CLARIFICATION` —
as decisões de stack já haviam sido tomadas antes deste documento. Este
documento registra a decisão e as alternativas consideradas para cada
escolha, para referência futura (e para poder justificar cada uma delas numa
entrevista).

## Canal de mensagens: Telegram (via `grammy`)

- **Decision**: Telegram Bot API, biblioteca `grammy` (TypeScript-first).
- **Rationale**: Bot API do Telegram é gratuita e não exige aprovação de
  negócio. `grammy` tem tipagem TS nativa, API moderna baseada em
  middleware/context, e é ativamente mantida.
- **Alternatives considered**:
  - `node-telegram-bot-api` — mais antiga, tipagem TS pior, API mais
    verbosa.
  - WhatsApp Cloud API (oficial) — exige verificação de negócio Meta e
    número dedicado, não é gratuita/imediata.
  - `whatsapp-web.js` (não-oficial) — grátis, mas usa engenharia reversa do
    WhatsApp Web; risco real de ban do número.

## LLM: NVIDIA NIM free tier

- **Decision**: endpoint OpenAI-compatible da NVIDIA (`integrate.api.nvidia.com/v1`).
- **Rationale**: free tier com créditos e rate limit generoso para uso de
  laboratório, SDK `openai` padrão (sem cliente proprietário), suporta
  tool-calling — necessário para o harness decidir entre RAG e ação.
- **Alternatives considered**: Groq free tier, Google Gemini free tier —
  ambos viáveis; NVIDIA foi escolhida por já ter um padrão de integração
  validado e testado previamente, reduzindo setup novo.

## Embeddings: `@xenova/transformers` (local)

- **Decision**: gerar embeddings localmente no processo Node, sem chamada de
  API externa.
- **Rationale**: custo zero garantido (não depende de free tier de terceiro
  para essa etapa), sem limite de rate para indexação, funciona offline após
  o modelo ser baixado uma vez.
- **Alternatives considered**: embeddings via API da NVIDIA/OpenAI —
  adicionaria uma dependência de rede a mais e consumiria quota do free tier
  do LLM para uma tarefa que não precisa de um modelo de linguagem completo.

## Vector store: `vectra` (arquivo local)

- **Decision**: índice vetorial em arquivo local via `vectra`.
- **Rationale**: corpus é pequeno (dezenas de chunks de 2 fontes); um
  arquivo local resolve sem precisar de Postgres/pgvector ou outro serviço
  hospedado — alinhado ao princípio de stack zero-custo e à escala real do
  projeto (rung 6/7 do ponytail: a solução mais simples que funciona).
- **Alternatives considered**: pgvector num Postgres gerenciado (ex.: Neon) —
  infraestrutura real, mas desnecessária para o volume de dados deste lab;
  guardado como upgrade path caso o corpus cresça muito além do que um
  índice em arquivo aguenta bem.

## Teste: `node:test` + `node:assert` nativos

- **Decision**: testes mínimos usando o runner de testes nativo do Node,
  sem Jest/Vitest.
- **Rationale**: constitution exige só "teste mínimo para lógica
  não-trivial" — o runner nativo já cobre isso sem dependência nova.
- **Alternatives considered**: Vitest/Jest — mais recursos, mas dependência
  extra injustificada para um punhado de testes `assert`-based.
