# Tasks: Agente de Suporte Fintech via Telegram (RAG + Tools)

**Input**: Design documents from `/specs/001-telegram-rag-support/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos — Constitution Principle VI exige teste mínimo (`node:test`)
para toda lógica não-trivial (harness, retrieval, tools).

**Organization**: tasks agrupadas por user story (spec.md), cada fase é um
incremento demonstrável de forma independente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1/US2/US3 conforme spec.md
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Projeto único (ver plan.md → Project Structure): `src/`, `data/`, `scripts/`
na raiz do repositório.

---

## Phase 1: Setup

**Purpose**: inicialização do projeto Node/TS

- [ ] T001 Criar estrutura de diretórios per plan.md: `src/`, `data/docs/pix-bacen/`, `data/docs/celcoin/`, `data/docs/stripe/`, `data/index/`, `scripts/`
- [ ] T002 Inicializar projeto Node com `package.json` + `tsconfig.json` (TypeScript 5, target Node 20)
- [ ] T003 [P] Instalar dependências de runtime: `grammy`, `openai`, `@xenova/transformers`, `vectra`
- [ ] T004 [P] Instalar dependências de dev: `typescript`, `tsx` (execução direta de TS), `@types/node`
- [ ] T005 [P] Criar `.env.example` com `TELEGRAM_BOT_TOKEN` e `NVIDIA_API_KEY` (documentação, sem valores reais)
- [ ] T006 [P] Adicionar scripts `dev`, `ingest`, `test` ao `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestrutura compartilhada — o esqueleto do harness e a
integração Telegram↔LLM, sem RAG/tools ainda. Bloqueia todas as user stories.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase estar completa

- [ ] T007 Implementar carregamento de config/segredos (lê `TELEGRAM_BOT_TOKEN`, `NVIDIA_API_KEY` de `.env`, falha com mensagem clara se faltar) em `src/config.ts`
- [ ] T008 [P] Implementar logger estruturado leve (sem dependência nova — `console` com prefixo/nível) em `src/logger.ts`
- [ ] T009 [P] Implementar client do LLM (NVIDIA NIM via SDK `openai`, timeout + 1 retry simples em erro transitório) em `src/llm.ts`
- [ ] T010 [P] Implementar histórico de conversa em memória, chaveado por `chatId` (`ConversationTurn[]` — ver data-model.md) em `src/history.ts`
- [ ] T011 Implementar o loop do harness (`src/harness.ts`): monta mensagens (system + histórico), chama `llm.ts`, decide entre `tool_call` e resposta final, repete até resposta final — SEM tools/RAG registrados ainda (registro vazio, extensível nas fases seguintes)
- [ ] T012 Implementar `src/bot.ts`: setup do `grammy` em long polling, roteia cada mensagem recebida para `harness.ts` e responde com o texto final (depende de T007, T010, T011)
- [ ] T013 [P] Teste mínimo do loop de decisão do harness (mock do LLM retornando tool_call vs texto final) em `src/harness.test.ts`

**Checkpoint**: bot responde no Telegram com texto gerado pelo LLM (ainda sem
fundamentação em documentos e sem tools) — valida a fiação
Telegram↔harness↔LLM antes de empilhar RAG e tools por cima.

---

## Phase 3: User Story 1 - Responder dúvidas fundamentadas em documentação (Priority: P1) 🎯 MVP

**Goal**: respostas fundamentadas em documentação real multi-fonte, com
fallback explícito de "não sei" quando não há contexto relevante.

**Independent Test**: enviar pergunta coberta por uma fonte, pergunta que
cruza duas fontes, e pergunta fora do corpus — ver `quickstart.md` → US1.

### Tests for User Story 1

- [ ] T014 [P] [US1] Teste de retrieval: pergunta conhecida → chunk/`source` esperados, e pergunta sem contexto relevante → lista vazia (per contracts/retrieval.md) em `src/rag.test.ts`

### Implementation for User Story 1

- [ ] T015 [P] [US1] Popular `data/docs/pix-bacen/`, `data/docs/celcoin/`, `data/docs/stripe/` com pelo menos um documento de referência cada (conteúdo real, não placeholder)
- [ ] T016 [US1] Implementar `scripts/ingest.ts`: lê `data/docs/**`, faz chunking, gera embeddings via `@xenova/transformers`, popula índice `vectra` em `data/index/` com metadado `source`/`path` (data-model.md → DocumentChunk)
- [ ] T017 [US1] Implementar `retrieve(query, topK?)` em `src/rag.ts` per contracts/retrieval.md (carrega índice `vectra`, embeda a query, retorna `RetrievedChunk[]` com `source`+`score`, filtra por limiar mínimo)
- [ ] T018 [US1] Integrar RAG ao harness: em `src/harness.ts`, injetar os `RetrievedChunk[]` recuperados no contexto antes de chamar o LLM; system prompt instrui a responder só com base no contexto e dizer que não sabe se a lista vier vazia (FR-003)
- [ ] T019 [US1] Validação manual: rodar os 3 cenários de `quickstart.md` → US1

**Checkpoint**: MVP completo e demonstrável — bot responde no Telegram com
respostas fundamentadas em documentação real de múltiplas fontes.

---

## Phase 4: User Story 2 - Consultar status de uma transação (Priority: P2)

**Goal**: o bot decide dinamicamente entre responder via RAG e executar uma
ação (consulta), em vez de só recuperar texto.

**Independent Test**: perguntar status de uma transação existente e de uma
inexistente, e sem informar o id — ver `quickstart.md` → US2.

### Tests for User Story 2

- [ ] T020 [P] [US2] Teste da tool `consultar_status_transacao`: id existente → status correspondente, id inexistente → `nao_encontrado` (per contracts/tools.md) em `src/tools.test.ts`

### Implementation for User Story 2

- [ ] T021 [P] [US2] Implementar schema + dados simulados + execução de `consultar_status_transacao` em `src/tools.ts` (per contracts/tools.md e data-model.md → SimulatedTransaction)
- [ ] T022 [US2] Registrar a tool no harness: `src/harness.ts` passa o schema ao LLM na chamada, executa a função local quando o LLM retorna `tool_call`, injeta o resultado de volta no histórico e repete o loop
- [ ] T023 [US2] Ajustar system prompt para pedir o identificador quando o usuário perguntar status sem informá-lo (Acceptance Scenario 2 da US2)
- [ ] T024 [US2] Validação manual: rodar os 2 cenários de `quickstart.md` → US2

**Checkpoint**: bot decide dinamicamente entre RAG e tool-call — demonstra a
diferença entre agente e busca de documentos.

---

## Phase 5: User Story 3 - Abrir um chamado de suporte (Priority: P3)

**Goal**: ciclo completo de agente (ler documentação, consultar estado,
alterar estado) com continuidade de conversa multi-turno.

**Independent Test**: relatar um problema, confirmar abertura de ticket, e
emendar uma pergunta que reusa informação já dada na conversa — ver
`quickstart.md` → US3.

### Tests for User Story 3

- [ ] T025 [P] [US3] Teste da tool `abrir_ticket`: cria registro com `subject`/`description` e persiste em `data/tickets.json` (per contracts/tools.md e data-model.md → SupportTicket) em `src/tools.test.ts`

### Implementation for User Story 3

- [ ] T026 [P] [US3] Implementar schema + execução de `abrir_ticket` em `src/tools.ts` (append em `data/tickets.json`)
- [ ] T027 [US3] Registrar a segunda tool no harness (mesma mecânica de T022, reaproveitada — sem lógica nova de loop)
- [ ] T028 [US3] Garantir que `src/harness.ts` envia o histórico completo da conversa (não só a última mensagem) em cada chamada ao LLM, para que dados já mencionados (ex.: id de transação) não precisem ser repetidos (FR-006)
- [ ] T029 [US3] Ajustar system prompt para pedir assunto/descrição antes de chamar `abrir_ticket` quando a conversa ainda não tiver essa informação (Acceptance Scenario 2 da US3)
- [ ] T030 [US3] Validação manual: rodar os 3 cenários de `quickstart.md` → US3

**Checkpoint**: todas as user stories funcionando juntas — RAG, duas tools e
multi-turno.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T031 [P] Escrever `README.md` com setup resumido (link para `quickstart.md`)
- [ ] T032 Revisar tratamento de erro/timeout nas chamadas ao LLM (`src/llm.ts`) e na execução de tools (`src/tools.ts`) — falha não deve derrubar o processo do bot (Constitution Principle V)
- [ ] T033 Rodar `quickstart.md` de ponta a ponta (US1+US2+US3 na mesma sessão de conversa) antes de considerar a feature pronta
- [ ] T034 [P] Confirmar que `npm test` roda `harness.test.ts`, `rag.test.ts` e `tools.test.ts` e todos passam

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: depende do Setup — bloqueia todas as user stories
- **User Stories (Phase 3-5)**: todas dependem do Foundational completo
  - US1 não depende de US2/US3
  - US2 depende do registro de tools no harness introduzido em T022, mas não depende de US1 ter sido implementado (RAG e tool-calling são branches independentes do mesmo loop)
  - US3 reaproveita o mecanismo de tool-calling de US2 (T027 depende de T022) — não é possível pular US2 e ir direto para US3
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas

### Dentro de cada User Story

- Testes antes da implementação correspondente (escrever T014/T020/T025 e ver falhar antes de implementar)
- Tools/retrieval antes de integrar ao harness
- Integração ao harness antes da validação manual

### Parallel Opportunities

- T003-T006 (Setup) podem rodar em paralelo
- T008, T009, T010 (Foundational) tocam arquivos diferentes — paralelos entre si (T007 e T011/T012 têm dependência sequencial)
- T014 (teste US1) e T015 (seed de docs) são paralelos
- T020 (teste US2) e T021 (implementação da tool) são paralelos
- T025 (teste US3) e T026 (implementação da tool) são paralelos

---

## Parallel Example: User Story 1

```bash
# Em paralelo, arquivos diferentes:
Task: "Teste de retrieval em src/rag.test.ts (T014)"
Task: "Popular data/docs/pix-bacen|celcoin|stripe (T015)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Completar Phase 1 (Setup) e Phase 2 (Foundational)
2. Completar Phase 3 (US1)
3. **Parar e validar**: rodar `quickstart.md` → US1 isoladamente
4. Já é demonstrável como "bot RAG" — ponto natural para mostrar pro amigo

### Incremental Delivery

1. Setup + Foundational → bot responde no Telegram (sem grounding ainda)
2. + US1 → RAG funcionando (MVP)
3. + US2 → primeira tool, harness vira agente de verdade
4. + US3 → segunda tool + multi-turno completo
5. Cada etapa é demonstrável sem quebrar a anterior

---

## Notes

- [P] = arquivos diferentes, sem dependência
- Label [Story] rastreia cada task até a user story correspondente em spec.md
- Cada user story é completável e testável de forma independente
- Commitar após cada task ou grupo lógico de tasks
- Parar em qualquer checkpoint acima já entrega algo demonstrável
