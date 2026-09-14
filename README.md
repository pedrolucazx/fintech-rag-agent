# Fintech RAG Agent — Bot de Atendimento Financeiro via Telegram

Assistente de atendimento financeiro para a operadora fictícia **ConectaNet**, construído com RAG (Retrieval-Augmented Generation) sobre documentação real de PIX/Bacen e FAQ de faturamento, com tools para consulta de status de fatura e abertura de chamados.

## Visão Geral

- **RAG multi-fonte**: regulamento PIX (Bacen) + FAQ ConectaNet (faturamento)
- **Tools**: `consultar_status_fatura` (dados simulados) + `abrir_ticket` (persistência em `data/tickets.json`)
- **Multi-turno**: histórico de conversa completo enviado ao LLM a cada turno
- **Providers trocáveis**: NVIDIA NIM (default) ou Gemini via `LLM_PROVIDER`; Xenova local (default) ou Voyage AI via `EMBEDDINGS_PROVIDER`
- **Cache Redis**: respostas do LLM cacheadas (TTL 5 min) para reduzir chamadas repetidas
- **Testes**: 24 testes (`node:test` + `node:assert`) cobrendo retrieval, tools, harness, cache e seleção de providers

## Início Rápido

### Pré-requisitos

- Node.js 20+
- Docker (para Redis)
- Chaves de API:
  - `TELEGRAM_BOT_TOKEN` (obrigatório)
  - `NVIDIA_API_KEY` (obrigatório para provider default)
  - `GEMINI_API_KEY` (opcional, para `LLM_PROVIDER=gemini`)
  - `VOYAGE_API_KEY` (opcional, para `EMBEDDINGS_PROVIDER=voyage`)

### Setup

```bash
# 1. Clone e instale
git clone <repo>
cd fintech-rag-agent
npm install

# 2. Configure variáveis
cp .env.example .env
# edite .env com suas chaves

# 3. Suba o Redis
docker compose up -d

# 4. Ingira a documentação (gera embeddings e índice vectra)
npm run ingest

# 5. Rode os testes
npm test

# 6. Inicie o bot
npm run dev
```

### Estrutura de Dados

```
data/
├── docs/
│   ├── regulamentacao-pix/        # Regulamento PIX real (Bacen)
│   │   ├── 01-chaves-pix.md
│   │   ├── 02-limites-e-horarios.md
│   │   └── 03-devolucao-e-med.md
│   └── faturamento-conectanet/    # FAQ ConectaNet (fictício)
│       ├── 01-formas-de-pagamento.md
│       ├── 02-segunda-via-e-vencimento.md
│       └── 03-duvidas-de-cobranca.md
├── index/                         # Índice vectra (gerado por ingest)
├── index-provider.json            # Registra provider de embeddings usado
└── tickets.json                   # Chamados abertos (append-only)
```

## User Stories Implementadas

| US | Descrição | Status |
|----|-----------|--------|
| **US1** | Responder dúvidas fundamentadas em documentação (PIX/faturamento) com fallback "não sei" | ✅ |
| **US2** | Consultar status da própria fatura via tool `consultar_status_fatura` | ✅ |
| **US3** | Abrir chamado sobre dúvida de cobrança via tool `abrir_ticket` (multi-turno) | ✅ |

Veja cenários de validação em [`specs/001-telegram-rag-support/quickstart.md`](specs/001-telegram-rag-support/quickstart.md).

## Arquitetura

```
src/
├── bot.ts           # Grammy long polling → harness
├── harness.ts       # Loop: history + retrieve + LLM + tool-call
├── llm.ts           # Adapter NVIDIA/Gemini + cache Redis
├── embeddings.ts    # Adapter Xenova/Voyage AI
├── rag.ts           # retrieve() sobre índice vectra
├── tools.ts         # consultar_status_fatura + abrir_ticket
├── cache.ts         # getOrSet Redis (best-effort, nunca derruba o bot)
├── config.ts        # Carregamento .env + validação
├── history.ts       # ConversationTurn[] por chatId
├── logger.ts        # Console estruturado (prefixo/nível)
└── *.test.ts        # Testes unitários/integração
```

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia bot em long polling (tsx, sem build) |
| `npm run ingest` | Processa `data/docs/**` → embeddings → índice vectra |
| `npm test` | Roda todos os `src/*.test.ts` (requer Redis rodando) |
| `npm run typecheck` | `tsc --noEmit` — só checagem de tipos |
| `npm run build` | Typecheck + transpila `src/` → `dist/` com SWC |
| `npm start` | Roda o build de produção (`node dist/bot.js`) |

## Variáveis de Ambiente

| Variável | Obrigatória | Default | Descrição |
|----------|-------------|---------|-----------|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | Token do bot Telegram |
| `NVIDIA_API_KEY` | ✅ | — | Chave NVIDIA NIM |
| `NVIDIA_MODEL` | ❌ | `nvidia/nemotron-3-super-120b-a12b` | Modelo NVIDIA |
| `LLM_PROVIDER` | ❌ | `nvidia` | `nvidia` ou `gemini` |
| `GEMINI_API_KEY` | ❌ | — | Chave Gemini (se provider=gemini) |
| `GEMINI_MODEL` | ❌ | `gemini-2.5-flash` | Modelo Gemini |
| `EMBEDDINGS_PROVIDER` | ❌ | `xenova` | `xenova` ou `voyage` |
| `VOYAGE_API_KEY` | ❌ | — | Chave Voyage AI (se provider=voyage) |

## Testes

```bash
# Requer Redis rodando (docker compose up -d)
npm test
```

Cobertura atual (24 testes):
- `cache.test.ts` (4): TTL, keys diferentes, expiração, recuperação de conexão
- `harness.test.ts` (6): Texto direto, tool-call, multi-turno, args inválidos, adapter transport
- `llm.test.ts` (5): Seleção de provider NVIDIA/Gemini, Xenova/Voyage, modelo default
- `rag.test.ts` (2): Retrieval com fonte esperada, query fora do corpus → lista vazia
- `tools.test.ts` (7): Schemas, invoices, validação, tickets, falha de escrita

## Princípios (Constitution)

1. **Simplicidade**: Nenhuma abstração desnecessária; stdlib/nativo primeiro
2. **Testabilidade**: Toda lógica não-trivial tem teste mínimo (`node:test`)
3. **Resiliência**: Cache/Redis é best-effort — falha nunca derruba o bot
4. **Escopo contido**: Um único serviço Docker (Redis); sem infra extra
5. **Multi-tenancy ready**: Código preparado para isolamento futuro (já documentado em `spec.md`)

## Decisões e Limites Conhecidos

Simplificações deliberadas, com o teto de cada uma e quando revisitar:

- **Lock por `chatId`, não distribuído** (`harness.ts`, `withChatLock`): uma cadeia de promises em memória, suficiente pra impedir que duas mensagens da MESMA conversa entrelacem o histórico (risco real, já que uma chamada de tool aguarda o LLM no meio do turno). Chats diferentes seguem totalmente concorrentes. Não segura contra múltiplas réplicas do bot — precisaria de um lock distribuído (Redis) se isso rodar como mais de um processo.
- **Fila de escrita de tickets em processo único** (`tools.ts`, `ticketQueue`): serializa gravações concorrentes em `data/tickets.json` dentro do mesmo processo. Réplicas separadas do bot ainda podem colidir no arquivo. Trocar por um store de verdade (SQLite/DB) se isso rodar como mais de um processo.
- **Id de ticket sem checagem de unicidade** (`tools.ts`, `tk_${...}`): 6 hex chars (~16M combinações), sem validar contra tickets existentes — risco de colisão desprezível na escala deste projeto. Adicionar checagem de unicidade se o volume de tickets crescer de verdade.
- **Ano padrão de fatura fixo no corpus fake** (`tools.ts`, `DEFAULT_INVOICE_YEAR`): quando o cliente diz só o mês ("setembro"), sem ano, assume o ano do corpus fake do lab (2026). Um sistema real derivaria isso da data atual, não de uma constante.
- **Provider (LLM/embeddings) sem registry genérico** (`providers/llm.ts`, `providers/embeddings.ts`): singleton por nome, escolhido uma vez via env var — sem container de DI nem plugin system, porque este processo nunca precisa de duas instâncias vivas do mesmo provider ao mesmo tempo. Revisitar se algum dia for necessário multi-tenant com provider por request/instância.
- **Cache Redis best-effort** (`providers/cache.ts`): qualquer falha de leitura/escrita no Redis é logada e ignorada, caindo direto pra chamada real — uma queda do Redis nunca derruba o bot, só perde o cache.
- **Fallback de LLM sem rótulo próprio no cache** (`providers/llm.ts`, `FallbackLlmProvider`): se o provider primário falhar e o secundário responder, a chave de cache continua rotulada com o nome/modelo do primário — a resposta em si é válida, só a proveniência no log/cache não reflete que veio do fallback. Rastrear a proveniência de verdade exigiria separar a chave por resultado real, não por provider configurado; não vale a pena pra um caminho que só roda quando o primário já está fora do ar.

## Documentação Completa

- **Spec**: [`specs/001-telegram-rag-support/spec.md`](specs/001-telegram-rag-support/spec.md)
- **Plano**: [`specs/001-telegram-rag-support/plan.md`](specs/001-telegram-rag-support/plan.md)
- **Tasks**: [`specs/001-telegram-rag-support/tasks.md`](specs/001-telegram-rag-support/tasks.md)
- **Contratos**: [`specs/001-telegram-rag-support/contracts/`](specs/001-telegram-rag-support/contracts/)
- **Quickstart**: [`specs/001-telegram-rag-support/quickstart.md`](specs/001-telegram-rag-support/quickstart.md)

## Licença

MIT — uso livre para estudo, demonstração e extensão.