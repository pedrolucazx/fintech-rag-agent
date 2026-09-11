# Contract: Retrieval (RAG)

Contrato da função de recuperação exposta por `src/rag.ts` ao harness. Cobre
User Story 1 / FR-001, FR-002, FR-003.

## `retrieve(query: string, topK?: number): RetrievedChunk[]`

**Input**: pergunta em linguagem natural do cliente (texto bruto, sem
pré-processamento externo).

**Output**: lista ordenada por relevância (mais relevante primeiro):
```ts
type RetrievedChunk = {
  text: string;
  source: string;   // FR-002: sempre presente, nunca vazio
  score: number;     // similaridade (0-1), usada para decidir se há contexto relevante
};
```

**Contract rules**:
- Se nenhum chunk tiver `score` acima de um limiar mínimo definido em
  `rag.ts`, retorna lista vazia — é assim que o harness identifica "não há
  contexto relevante" e aciona o comportamento de FR-003 (dizer que não sabe,
  em vez de inventar).
- Cada `RetrievedChunk.source` corresponde a um valor de `DocumentChunk.source`
  em `data-model.md` — é o que permite ao harness citar a fonte na resposta
  (SC-002).
- Não filtra por fonte a priori — a pergunta pode ser respondida por chunks
  de múltiplas fontes ao mesmo tempo; cabe ao prompt do LLM decidir o que é
  relevante entre os chunks retornados.
