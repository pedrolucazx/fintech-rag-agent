# Contract: Tools expostas ao LLM

Estas são as únicas interfaces externas do sistema (não há API HTTP pública
— o "contrato" relevante é o schema de tool-calling que o harness expõe ao
LLM, definido em `src/tools.ts`).

## `consultar_status_fatura`

Cobre User Story 2 / FR-004.

**Input (JSON schema)**:
```json
{
  "name": "consultar_status_fatura",
  "description": "Consulta o status da fatura/pagamento do próprio cliente a partir do identificador informado",
  "parameters": {
    "type": "object",
    "properties": {
      "id": { "type": "string", "description": "Identificador da fatura" }
    },
    "required": ["id"]
  }
}
```

**Output**:
```json
{ "id": "fat_202609", "status": "paga", "valor": 99.9, "vencimento": "2026-09-10" }
```
ou, se não encontrado:
```json
{ "id": "fat_000000", "status": "nao_encontrado" }
```

**Contract rules**:
- Nunca lança exceção para "não encontrado" — é um resultado válido (ver
  data-model.md → SimulatedInvoice).
- Se o harness chamar esta tool sem `id` resolvido na conversa, o LLM deve
  ter perguntado o `id` (ou o mês de referência) ao cliente antes
  (responsabilidade do harness/prompt, não da tool).

## `abrir_ticket`

Cobre User Story 3 / FR-005.

**Input (JSON schema)**:
```json
{
  "name": "abrir_ticket",
  "description": "Abre um chamado sobre dúvida de cobrança com o assunto e descrição do problema relatado pelo cliente",
  "parameters": {
    "type": "object",
    "properties": {
      "subject": { "type": "string", "description": "Resumo curto do problema" },
      "description": { "type": "string", "description": "Descrição detalhada do problema, incluindo dados relevantes já mencionados na conversa (ex.: id de fatura)" }
    },
    "required": ["subject", "description"]
  }
}
```

**Output**:
```json
{ "id": "tk_a1b2c3", "createdAt": 1757500000000 }
```

**Contract rules**:
- `subject` e `description` são obrigatórios no schema — o LLM não deve
  conseguir chamar esta tool com campos vazios; se faltar informação, a
  decisão certa do harness é responder pedindo o que falta (não chamar a
  tool com placeholders).
- Efeito colateral: grava um registro em `data/tickets.json` (append-only).
