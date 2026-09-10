# Lab: Agente de Suporte Fintech (RAG + Tools + Harness caseiro)

## Contexto
Pedro busca recolocação como backend pleno/sênior em fintech (ver memória `recolocacao-backend-fintech`). Um amigo quer indicá-lo pra uma vaga e perguntou "tu se garante em montar um bot com RAG?". O objetivo deste lab não é só ter um bot funcionando, é Pedro conseguir **explicar em entrevista** o que é harness, RAG, tool-calling e agente vs automação — usando código próprio, não um framework caixa-preta. Projeto separado do PAC-mentor e do LedgerPay (âncora do fintech "from scratch"); este é o lab de aprendizado de IA em si, alinhado ao conteúdo do FullCycle Tech Week (RAG, embeddings, vector DB, harness, MCP, agentes vs automação).

Canal escolhido: **Telegram** (grammy) — gratuito, sem aprovação, sem risco de ban, ao contrário do WhatsApp não-oficial (whatsapp-web.js).

## Ideia do produto
Bot Telegram que simula um agente de suporte técnico de uma fintech: responde dúvidas sobre integração de pagamentos (PIX) usando RAG sobre documentação real (ex: doc pública do Bacen sobre PIX, ou a doc da Celcoin que Pedro já usou no TRIWAGE), e executa ações via tool-calling — consultar status de uma transação (mockado) e abrir um ticket de suporte (mockado). Pitch de entrevista: "construí o harness do zero pra entender de verdade o loop de um agente, e um RAG sobre doc de PIX pra fundamentar as respostas".

## Stack (zero custo, reaproveitando o que Pedro já tem funcionando no pac-mentor)
- **Node.js + TypeScript** (stack forte dele)
- **grammy** — framework Telegram Bot API, TS-first
- **NVIDIA NIM free tier** — mesma `nvapi-` key/endpoint OpenAI-compatible já em uso no pac-mentor (`lib/mentor.ts` como referência de padrão de chamada)
- **Embeddings locais**: `@xenova/transformers` — roda no processo Node, sem custo de API
- **Vector store local**: `vectra` — arquivo local, zero infraestrutura (dado o corpus pequeno, dispensa Postgres/pgvector)
- **Corpus RAG**: markdown/PDF da doc pública de PIX (Bacen) e/ou doc da Celcoin — chunking simples por seção/parágrafo

## O harness caseiro (núcleo pedagógico do projeto)
Loop explícito, escrito à mão (sem LangGraph/ADK) — é a peça que Pedro precisa entender linha a linha pra defender em entrevista:

1. Monta as mensagens: system prompt + histórico da conversa + chunks relevantes recuperados via RAG
2. Chama o LLM (NVIDIA) passando a definição das tools disponíveis (JSON schema)
3. Se o LLM retorna uma `tool_call` → executa a função local correspondente → injeta o resultado no histórico → volta ao passo 2
4. Se o LLM retorna texto final → envia a resposta ao usuário no Telegram

Tools mockadas (sem integração real, é lab):
- `consultar_status_transacao(id)` — retorna status fake de uma transação PIX
- `abrir_ticket(assunto, descricao)` — grava um "ticket" em um JSON local

## Estrutura de arquivos (projeto novo, enxuto)
- `src/bot.ts` — setup do grammy (long polling, sem precisar de deploy pra demo)
- `src/harness.ts` — o loop do agente descrito acima
- `src/rag.ts` — chunking, embedding (xenova) e retrieval (vectra)
- `src/tools.ts` — schema + execução das tools mockadas
- `src/llm.ts` — client NVIDIA (mesmo padrão do pac-mentor)
- `data/docs/` — corpus (doc PIX/Celcoin em .md)
- `data/tickets.json` — "banco" mockado de tickets

## Escopo incremental (parar em qualquer etapa já é demonstrável)
1. **MVP** — RAG puro funcionando: pergunta sobre a doc PIX → resposta fundamentada nos chunks corretos
2. **v2** — adiciona a tool `consultar_status_transacao`, LLM decide dinamicamente entre responder via RAG ou chamar a tool
3. **v3** — adiciona `abrir_ticket` + loop multi-turno completo (tool chama tool, histórico persistente na conversa)

## Conceitos que o projeto deixa Pedro pronto pra explicar
- **Harness**: `harness.ts` — por que existe um loop e não uma chamada única ao LLM
- **RAG**: `rag.ts` — chunking, embeddings, retrieval, por que grounding reduz alucinação
- **Tool-calling / agente vs automação**: `tools.ts` + decisão dinâmica do LLM no loop (automação = fluxo fixo; agente = LLM decide o próximo passo)
- **Prompt/Context engineering**: como o system prompt, histórico e chunks RAG são montados a cada chamada

## Verificação
- Rodar o bot localmente via long polling do Telegram (sem necessidade de deploy)
- 1 smoke-test simples, sem framework (`src/rag.test.ts` ou similar): pergunta conhecida → assert que a resposta recuperada contém o trecho esperado da doc — cobre a lógica não-trivial de retrieval
- Testar manualmente no bot real: 1 pergunta RAG-puro, 1 que aciona `consultar_status_transacao`, 1 que aciona `abrir_ticket`, 1 fluxo multi-turno — antes de considerar cada etapa (MVP/v2/v3) pronta
