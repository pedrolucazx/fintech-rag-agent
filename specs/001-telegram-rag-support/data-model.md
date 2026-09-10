# Data Model: Agente de Suporte Fintech via Telegram

Entidades extraídas de `spec.md` (Key Entities). Sem implementação de banco
de dados — modeladas como estruturas em memória/arquivo local (ver `plan.md`
→ Storage).

## DocumentChunk (Documento de referência, fragmentado)

Representa um fragmento indexado de uma fonte de documentação.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | Identificador único do chunk |
| `source` | string | Fonte de origem (`pix-bacen`, `celcoin`, `stripe`, ...) — obrigatório, sustenta FR-002 |
| `path` | string | Caminho do arquivo original em `data/docs/<source>/` |
| `text` | string | Conteúdo textual do fragmento |
| `embedding` | number[] | Vetor de embedding do `text`, gerado por `@xenova/transformers` |

**Validation rules**: `source` não pode ser vazio (toda resposta fundamentada
precisa indicar proveniência, FR-002/FR-003). `text` não pode ser vazio.

## ConversationTurn (Conversa)

Representa uma mensagem dentro do histórico de uma conversa (chat do
Telegram).

| Campo | Tipo | Descrição |
|---|---|---|
| `chatId` | string | Identificador do chat do Telegram — chave de sessão |
| `role` | `"user" \| "assistant" \| "tool"` | Papel da mensagem no histórico enviado ao LLM |
| `content` | string | Conteúdo da mensagem (texto do usuário, resposta do modelo, ou resultado de uma tool) |
| `toolCall` | `{ name: string; args: object } \| null` | Presente quando `role` é `"assistant"` e o LLM decidiu chamar uma tool |
| `timestamp` | number | Momento da mensagem, usado para ordenar o histórico |

**Relationships**: várias `ConversationTurn` pertencem a um `chatId` (1
conversa = N turnos). O histórico de turnos de um `chatId` é o que dá
continuidade multi-turno (FR-006, SC-005).

**State transitions**: nenhuma — é um log append-only por conversa, mantido
em memória durante a vida do processo (ver Assumptions em `spec.md`: sem
requisito de persistência entre reinícios).

## SimulatedTransaction (Transação simulada)

Registro fictício de pagamento usado pela tool `consultar_status_transacao`.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | Identificador da transação, informado pelo usuário |
| `status` | `"pendente" \| "aprovado" \| "recusado"` | Status simulado |

**Validation rules**: se `id` não existir no conjunto de dados simulados, a
tool retorna explicitamente "não encontrado" (alimenta o Edge Case de
FR-004/Acceptance Scenario 2 da User Story 2 — não é erro, é um resultado
válido).

## SupportTicket (Chamado de suporte)

Registro criado pela tool `abrir_ticket`.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | Identificador gerado no momento da criação |
| `subject` | string | Assunto do chamado (extraído da conversa) |
| `description` | string | Descrição do problema (extraída da conversa) |
| `chatId` | string | Referência à conversa de origem |
| `createdAt` | number | Timestamp de criação |

**Validation rules**: `subject` e `description` são obrigatórios — se a
conversa ainda não reuniu essa informação, o harness deve pedir mais dados
em vez de chamar a tool com campos vazios (FR-005, Acceptance Scenario 2 da
User Story 3). Persistido em `data/tickets.json` (append).
