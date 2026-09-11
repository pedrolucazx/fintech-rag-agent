# Quickstart: Validação da Feature 001

Guia para rodar e validar a feature ponta a ponta. Não é documentação de
implementação — ver `contracts/` e `data-model.md` para os detalhes de cada
peça.

## Pré-requisitos

- Node.js 20+
- Um bot criado no Telegram via [@BotFather](https://t.me/BotFather), com o
  token salvo em `.env` (`TELEGRAM_BOT_TOKEN`)
- Chave da NVIDIA NIM em `.env` (`NVIDIA_API_KEY`) — obtida em
  [build.nvidia.com](https://build.nvidia.com)
- Pelo menos um documento em `data/docs/pix-bacen/` e em
  `data/docs/faturamento-conectanet/`

## Setup

1. `npm install`
2. Popular `data/docs/pix-bacen/` (regulamento PIX/Bacen) e
   `data/docs/faturamento-conectanet/` (FAQ de faturamento: 2ª via, formas
   de pagamento, prazos)
3. `npm run ingest` — roda `scripts/ingest.ts`, gera o índice em `data/index/`
4. `npm run dev` — inicia `src/bot.ts` em long polling

## Cenários de validação (um por User Story)

### US1 — RAG puro (P1)

1. No Telegram, pergunte algo coberto por apenas uma fonte (ex.: "quais
   tipos de chave PIX existem?", coberto só pelo regulamento PIX/Bacen).
   **Esperado**: resposta reflete o conteúdo do documento, não conhecimento
   genérico.
2. Pergunte algo coberto só pelo FAQ de faturamento (ex.: "como emito a 2ª
   via da minha fatura?").
   **Esperado**: resposta usa a fonte certa, sem misturar conteúdo do
   regulamento PIX.
3. Pergunte algo fora do corpus indexado (ex.: "por que minha internet caiu
   ontem?" — suporte técnico, não faturamento).
   **Esperado**: bot diz que não tem essa informação, não inventa resposta
   (FR-003).

### US2 — Consultar status da fatura (P2)

1. Pergunte "minha fatura `<id-existente>` já foi paga?"
   **Esperado**: retorna o status correspondente (ver dados simulados em
   `tools.ts`).
2. Pergunte "minha fatura já caiu o pagamento?" sem informar o id.
   **Esperado**: bot pergunta o id (ou o mês de referência) antes de tentar
   consultar.

### US3 — Abrir chamado + multi-turno (P3)

1. Diga "minha fatura `<id>` veio com valor errado, preciso de ajuda".
2. Confirme quando o bot pedir mais detalhes, se pedir.
   **Esperado**: um chamado é registrado em `data/tickets.json` com
   `subject`/`description` coerentes, e o bot confirma a abertura
   referenciando o id do chamado.
3. Na mesma conversa, pergunte de novo pelo status da mesma fatura sem
   repetir o id.
   **Esperado**: bot usa o id já mencionado anteriormente na conversa
   (SC-005).

## Verificação automatizada

- `npm test` roda os testes `node:test` colocados em `src/*.test.ts`
  (`rag.test.ts`, `harness.test.ts`, `tools.test.ts`) — cobre a lógica de
  decisão do harness e o retrieval, não substitui os cenários manuais acima.
