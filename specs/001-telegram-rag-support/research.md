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

## LLM: adapter com NVIDIA (default) + Gemini

- **Decision**: interface mínima `chat(messages, tools?)` em `src/llm.ts`,
  com dois providers reais: NVIDIA NIM (default) e Gemini, selecionáveis
  por `LLM_PROVIDER`. Gemini é acessado pelo mesmo SDK `openai` já em uso,
  só trocando `baseURL` pro endpoint OpenAI-compatible do Gemini
  (`generativelanguage.googleapis.com/v1beta/openai/`) — suporta chat
  multi-turno e tool-calling nesse modo, então nenhuma dependência nova é
  necessária.
- **Rationale**: prova que o adapter troca de provider de verdade (2
  implementações reais), sem precisar de um SDK por provider — o endpoint
  OpenAI-compatible do Gemini existe exatamente pra esse tipo de reuso.
- **Alternatives considered**: SDK nativo do Google (`@google/genai`) —
  funcionaria, mas adicionaria uma dependência e um formato de mensagem
  diferente do `openai`, exigindo um mapeamento a mais só pra ganhar
  recursos que o endpoint compatível já cobre pro nosso caso de uso.

## Embeddings: adapter com Xenova (default, local) + Voyage AI (opcional)

- **Decision**: interface mínima `embed(text)` em `src/embeddings.ts`, com
  `@xenova/transformers` como default local e Voyage AI como alternativa
  opcional (via `VOYAGE_API_KEY`), selecionável por `EMBEDDINGS_PROVIDER`.
  Voyage AI é chamado por `fetch` nativo direto em
  `POST https://api.voyageai.com/v1/embeddings` — sem SDK novo, já que é um
  REST simples.
- **Rationale**: Xenova continua sendo o default (zero custo garantido, zero
  rede); Voyage AI entra como segunda implementação real pra provar o
  adapter, com free tier próprio (200M tokens de crédito único por conta).
- **Alternatives considered**: SDK oficial `@voyage-ai/typescript-sdk` —
  dependência extra pra uma única chamada REST que `fetch` nativo já cobre
  (ponytail rung 3: stdlib/runtime resolve).

## Cache: resposta do LLM em memória (sem Redis)

- **Decision**: cache simples em `src/cache.ts` — um `Map` no processo,
  chave = hash de `(provider, messages, tools)`, com TTL curto, usado pelo
  `llm.ts` pra evitar rechamar o modelo com uma requisição idêntica.
- **Rationale**: reduz consumo de free tier/token em retries e perguntas
  repetidas dentro da mesma sessão, documentando uma preocupação real de
  custo de token mesmo em projeto de lab — sem precisar de infraestrutura
  externa pra isso.
- **Alternatives considered**: Redis (ex.: Upstash free tier) — resolveria
  cache compartilhado entre múltiplos processos/instâncias, mas o bot roda
  como processo único local; não há "outro processo" pra compartilhar cache
  com ele. Adicionar Redis aqui seria over-engineering (Constitution
  Principle VII) — fica como upgrade path caso o projeto vire multi-instância
  algum dia, o que não é o caso hoje. Nenhum banco de dados (Redis, Mongo,
  Postgres) é usado neste lab — persistência real é escopo do projeto-âncora
  fintech separado.
