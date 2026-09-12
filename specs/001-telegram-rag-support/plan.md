# Implementation Plan: Bot de Atendimento Financeiro via Telegram (RAG + Tools)

**Branch**: `001-telegram-rag-support` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-telegram-rag-support/spec.md`

## Summary

Bot no Telegram que simula o atendimento financeiro de uma operadora de
telecom fictícia ("ConectaNet") ao cliente final: responde perguntas sobre
fatura e pagamento (PIX/boleto) fundamentando respostas via RAG sobre
regulamento PIX/Bacen + FAQ de faturamento, e executa duas ações via
tool-calling (consultar status da própria fatura, abrir chamado sobre
dúvida de cobrança), mantendo contexto de conversa multi-turno. O loop de
decisão (RAG vs tool vs pedir mais info) é um harness escrito à mão — sem
framework de orquestração de agentes — rodando inteiramente em serviços
gratuitos.

## Technical Context

**Language/Version**: Node.js 20+ / TypeScript 5

**Primary Dependencies**: `grammy` (Telegram Bot API), `openai` SDK apontado
para o endpoint OpenAI-compatible da NVIDIA NIM (default) ou do Gemini
(`LLM_PROVIDER=gemini`), `@xenova/transformers` (embeddings locais,
default) com Voyage AI como alternativa via `fetch` nativo
(`EMBEDDINGS_PROVIDER=voyage`), `vectra` (vector store local em arquivo),
`ioredis` (client Redis pro cache). Os providers extras (Gemini, Voyage AI)
reaproveitam o SDK `openai` já instalado e `fetch` nativo — `ioredis` é a
única dependência nova desta rodada.

**Storage**: Arquivos locais — índice do `vectra` (embeddings dos chunks de
documentação) e `data/tickets.json` (chamados simulados, gerado em runtime,
fora do controle de versão). Redis local (via Docker) só pro cache de
resposta do LLM. Sem banco de dados hospedado, sem Mongo/Postgres.

**Testing**: `node:test` + `node:assert` (nativo do Node, sem framework
externo), um arquivo de teste mínimo por módulo com lógica não-trivial;
`cache.test.ts` roda contra um Redis real local (`docker compose up -d`
antes de `npm test`)

**Target Platform**: Máquina local (Linux), processo Node de longa duração
via long polling do Telegram + 1 container Docker (Redis) — sem deploy
hospedado

**Project Type**: Serviço único (processo Node/bot), sem frontend

**Performance Goals**: Uso individual (1 usuário por conversa); resposta em
poucos segundos é aceitável (não há requisito de baixa latência de produção)

**Constraints**: Custo zero de infraestrutura (só free tiers); harness
escrito à mão (sem LangChain/LangGraph/ADK); sem Docker/CI-CD/deploy
hospedado (fora de escopo, ver constitution)

**Scale/Scope**: Corpus pequeno (2 fontes de documentação, dezenas de
chunks); demo pessoal/portfólio, não precisa suportar múltiplos usuários
simultâneos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Ponytail | PASS — estrutura de projeto enxuta (5 módulos em `src/`), sem abstrações especulativas |
| II. Harness escrito à mão | PASS — `harness.ts` é o loop decisório próprio; nenhuma dependência de orquestração de agentes na lista de Primary Dependencies |
| III. Stack zero-custo | PASS — todas as dependências (NVIDIA free tier, embeddings locais, vector store local, Telegram Bot API) são gratuitas |
| IV. RAG multi-fonte com proveniência | PASS — ver Data Model: chunk carrega `source` |
| V. Qualidade prod-relevante só onde importa | PASS — segredos via `.env`, erro/timeout/retry nas chamadas ao LLM e tools, logging leve; sem Docker/CI/deploy (fora de escopo) |
| VI. Teste mínimo para lógica não-trivial | PASS — `node:test` colocado com `rag.ts`, `harness.ts`, `tools.ts`, `cache.ts` |
| VII. Providers trocáveis, sem registry especulativo | PASS — `llm.ts`/`embeddings.ts` têm 2 implementações reais cada (NVIDIA+Gemini, Xenova+Voyage), sem plugin system genérico; cache via Redis contido a essa única finalidade, sem Mongo/Postgres/LocalStack |

Nenhuma violação — Complexity Tracking não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/001-telegram-rag-support/
├── plan.md              # Este arquivo
├── research.md          # Fase 0
├── data-model.md         # Fase 1
├── quickstart.md         # Fase 1
├── contracts/             # Fase 1
└── tasks.md              # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── bot.ts             # setup do grammy, long polling, roteamento de mensagem → harness
├── harness.ts          # o loop do agente: monta contexto → chama LLM → decide RAG/tool/resposta → repete
├── harness.test.ts      # teste mínimo do loop de decisão (mock de LLM)
├── rag.ts               # chunking e retrieval (vectra) com metadado de fonte, usa providers/embeddings.ts
├── rag.test.ts           # teste mínimo de retrieval (pergunta conhecida → chunk esperado)
├── tools.ts              # schema + execução de consultar_status_fatura e abrir_ticket
├── tools.test.ts          # teste mínimo de cada tool mockada
├── config.ts              # carregamento de config/segredos
├── history.ts             # histórico de conversa em memória
├── logger.ts              # logger estruturado leve
└── providers/             # adapters trocáveis (Constitution Principle VII)
    ├── llm.ts               # adapter de LLM: NVIDIA (default) + Gemini, via cache.ts
    ├── llm.test.ts
    ├── embeddings.ts         # adapter de embeddings: Xenova (default) + Voyage AI
    ├── cache.ts              # cache de resposta do LLM via Redis (ioredis, TTL nativo)
    └── cache.test.ts

data/
├── docs/
│   ├── regulamentacao-pix/            # regulamento PIX/Bacen (.md)
│   └── faturamento-conectanet/  # FAQ de faturamento da operadora fictícia (.md)
├── index/               # índice gerado pelo vectra (gitignored, reconstruível via script de ingest)
└── tickets.json         # chamados simulados (gitignored, gerado em runtime)

scripts/
└── ingest.ts            # script que lê data/docs/**, faz chunk+embed e popula data/index/

docker-compose.yml        # 1 serviço: redis:alpine, só pro cache (Constitution Principle V/VII)
```

**Structure Decision**: Projeto único (sem frontend/mobile). `src/` agrupa
por camada: módulos de domínio/orquestração (`bot.ts`, `harness.ts`,
`rag.ts`, `tools.ts`) e infra (`config.ts`, `history.ts`, `logger.ts`) na
raiz; adapters trocáveis (`llm.ts`, `embeddings.ts`, `cache.ts`) em
`src/providers/` — são a mesma categoria de peça (Constitution Principle
VII: implementação real por trás de uma interface mínima, sem registry
especulativo), então ficam juntos. Testes colocados junto ao módulo que
testam (evita árvore `tests/` paralela). `rag.ts` e `scripts/ingest.ts`
chamam `providers/embeddings.ts`, não implementam embedding diretamente.
Corpus e índice ficam fora de `src/` em `data/`, com um script de ingest
separado do runtime do bot (ingestão é um passo offline, não parte do loop
do harness).

## Complexity Tracking

*Não se aplica — nenhuma violação de constitution identificada.*
