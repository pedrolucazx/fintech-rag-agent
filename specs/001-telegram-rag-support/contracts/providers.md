# Contract: Adapters de LLM e Embeddings

Interfaces internas trocáveis (Constitution Principle VII) — não são API
pública, mas são um limite de contrato real dentro do código: qualquer
provider novo implementa a mesma assinatura, sem o resto do projeto saber
qual está ativo.

## LLM (`src/llm.ts`)

```ts
type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCall?: { id?: string; name: string; args: object } | null;
};
type ToolSchema = { name: string; description: string; parameters: object };
type ChatResult =
  | { type: "tool_call"; id?: string; name: string; args: object }
  | { type: "text"; content: string };

function chat(messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResult>;
```

**Seleção de provider**: variável de ambiente `LLM_PROVIDER` (`"nvidia"` |
`"gemini"`), default `"nvidia"`. Ambos usam o SDK `openai`, só trocando
`baseURL`/`apiKey`/`model`:

| Provider | `baseURL` | Env var da key |
|---|---|---|
| `nvidia` (default) | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai/` | `GEMINI_API_KEY` |

**Contract rules**:
- O adapter preserva o `id` da chamada do provider. O harness registra a
  chamada do assistente e o resultado com esse mesmo `id` (gera um se ausente
  em adapters simulados); o adapter os serializa como `tool_calls` e
  `tool_call_id`. Chamadas paralelas são desativadas porque o loop executa uma
  tool por vez.
- `chat()` SEMPRE passa por `cache.ts` antes de fazer a chamada de rede —
  mesma tupla `(provider, messages, tools)` dentro do TTL retorna do cache,
  sem nova chamada.
- Se `GEMINI_API_KEY` não estiver setada e `LLM_PROVIDER=gemini`, falha
  imediatamente na inicialização (mesma regra de `config.ts` pras outras
  chaves), não na primeira chamada.
- Timeout + 1 retry em erro transitório, por provider (ver contracts/tools.md
  → mesma filosofia de erro tratado, não propagado cru).

## Embeddings (`src/embeddings.ts`)

```ts
function embed(text: string): Promise<number[]>;
```

**Seleção de provider**: variável de ambiente `EMBEDDINGS_PROVIDER`
(`"xenova"` | `"voyage"`), default `"xenova"`.

| Provider | Como | Env var da key |
|---|---|---|
| `xenova` (default) | `@xenova/transformers`, local, sem rede | nenhuma |
| `voyage` (opcional) | `fetch` nativo em `POST https://api.voyageai.com/v1/embeddings` | `VOYAGE_API_KEY` |

**Contract rules**:
- O modelo de embedding usado no `ingest.ts` (indexação) e no `rag.ts`
  (query) DEVE ser o mesmo provider — misturar vetores gerados por
  providers diferentes no mesmo índice quebra a busca por similaridade.
  `embeddings.ts` não faz cache (embeddings da mesma query mudam pouco o
  suficiente pra não valer a complexidade — o cache que importa é o de
  `llm.ts`).

## Cache (`src/cache.ts`)

```ts
function getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
```

**Contract rules**:
- Implementação: Redis via `ioredis`, subido localmente por
  `docker-compose.yml` (serviço único `redis:alpine`) — TTL nativo do Redis
  (`SET key value PX ttlMs`), sem persistência garantida entre reinícios do
  container (cache, não fonte de verdade).
- Escopo contido (Constitution Principle V/VII): Redis é usado **só** por
  este módulo, pra este fim — histórico de conversa, faturas simuladas e
  tickets continuam sem banco, do jeito que já estava.
- `key` é responsabilidade de quem chama (`llm.ts` monta a partir de
  `provider + JSON.stringify(messages, tools)`), `cache.ts` não sabe nada
  sobre LLM especificamente — é um cache genérico reutilizável. A
  assinatura da função não muda em relação à primeira versão (só a
  implementação interna trocou de `Map` pra Redis) — é exatamente o que a
  interface deveria proteger.
