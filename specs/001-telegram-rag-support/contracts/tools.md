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
  "description": "Consulta o status da fatura/pagamento do próprio cliente a partir do CPF e do identificador ou mês de referência informados",
  "parameters": {
    "type": "object",
    "properties": {
      "cpf": { "type": "string", "description": "CPF do cliente, com ou sem pontuação" },
      "id": { "type": "string", "description": "Identificador da fatura ou mês de referência" }
    },
    "required": ["cpf", "id"]
  }
}
```

**Output**:
```json
{ "id": "fat_202609", "status": "paga", "valor": 99.9, "vencimento": "2026-09-10" }
```
ou, se não encontrado (id inexistente, ou CPF sem fatura para esse mês):
```json
{ "id": "fat_000000", "status": "nao_encontrado" }
```

**Contract rules**:
- Nunca lança exceção para "não encontrado" — é um resultado válido (ver
  data-model.md → SimulatedInvoice).
- Se o harness chamar esta tool sem `cpf`/`id` resolvidos na conversa, o
  LLM deve ter perguntado o CPF e o mês de referência ao cliente antes
  (responsabilidade do harness/prompt, não da tool).
- A busca filtra por `(id, cpf)` juntos — um `id` de fatura existente sob
  um CPF diferente do informado retorna `nao_encontrado`, não os dados de
  outro cliente. `cpf` nunca é retornado no resultado.

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
