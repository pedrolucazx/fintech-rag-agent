# Quickstart: Validação da Feature 001

Guia para rodar e validar a feature ponta a ponta. Não é documentação de
implementação — ver `contracts/` e `data-model.md` para os detalhes de cada
peça.

## Pré-requisitos

- Node.js 20+
- Um bot criado no Telegram via [@BotFather](https://t.me/BotFather), com o
  token salvo em `.env` (`TELEGRAM_BOT_TOKEN`)
- Chave da NVIDIA NIM em `.env` (`NVIDIA_API_KEY`) — mesma usada no
  `pac-mentor`
- Pelo menos um documento em `data/docs/<source>/` para cada fonte citada na
  spec (PIX/Bacen, Celcoin, Stripe)

## Setup

1. `npm install`
2. Popular `data/docs/<source>/` com o conteúdo de referência de cada fonte
3. `npm run ingest` — roda `scripts/ingest.ts`, gera o índice em `data/index/`
4. `npm run dev` — inicia `src/bot.ts` em long polling

## Cenários de validação (um por User Story)

### US1 — RAG puro (P1)

1. No Telegram, pergunte algo coberto por apenas uma fonte (ex.: um detalhe
   específico da doc PIX/Bacen).
   **Esperado**: resposta reflete o conteúdo do documento, não conhecimento
   genérico.
2. Pergunte algo que dependa de comparar duas fontes (ex.: "como Celcoin e
   Stripe tratam X?").
   **Esperado**: resposta usa as duas fontes corretamente, sem misturar
   informação irrelevante.
3. Pergunte algo fora do corpus indexado.
   **Esperado**: bot diz que não tem essa informação, não inventa resposta
   (FR-003).

### US2 — Consultar status (P2)

1. Pergunte "qual o status da transação `<id-existente>`?"
   **Esperado**: retorna o status correspondente (ver dados simulados em
   `tools.ts`).
2. Pergunte "qual o status da minha transação?" sem informar o id.
   **Esperado**: bot pergunta o id antes de tentar consultar.

### US3 — Abrir ticket + multi-turno (P3)

1. Diga "minha transação `<id>` não caiu, preciso de ajuda".
2. Confirme quando o bot pedir mais detalhes, se pedir.
   **Esperado**: um ticket é registrado em `data/tickets.json` com
   `subject`/`description` coerentes, e o bot confirma a abertura
   referenciando o id do ticket.
3. Na mesma conversa, pergunte de novo pelo status da mesma transação sem
   repetir o id.
   **Esperado**: bot usa o id já mencionado anteriormente na conversa
   (SC-005).

## Verificação automatizada

- `npm test` roda os testes `node:test` colocados em `src/*.test.ts`
  (`rag.test.ts`, `harness.test.ts`, `tools.test.ts`) — cobre a lógica de
  decisão do harness e o retrieval, não substitui os cenários manuais acima.
