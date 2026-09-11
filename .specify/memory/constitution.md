<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- Modified principles: IV. RAG Multi-Fonte com Proveniência (exemplo de fontes trocado de Bacen/Celcoin/Stripe para Bacen/PIX + FAQ de faturamento — persona virou cliente final, não desenvolvedor de integração)
- Added sections: "Persona e Domínio do Produto" (dentro de Stack e Escopo Técnico)
- Removed sections: none
- Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (generic, no changes needed)
  - ✅ .specify/templates/spec-template.md (generic, no changes needed)
  - ✅ .specify/templates/tasks-template.md (generic, no changes needed)
  - ✅ specs/001-telegram-rag-support/ (spec, plan, data-model, contracts, tasks reescritos na mesma mudança)
- Follow-up TODOs: none
-->

# Fintech RAG Agent Constitution

## Core Principles

### I. Ponytail (Simplicidade Radical, YAGNI)
Toda tarefa sobe a escada de simplicidade antes de escrever código: (1) precisa
existir? (2) já existe algo reaproveitável no projeto? (3) resolve com
stdlib/runtime nativo? (4) resolve com dependência já instalada? (5) resolve em
uma linha? Só então escreve o mínimo necessário. Abstrações, configs ou
flexibilidade especulativa para requisitos hipotéticos são PROIBIDAS. Divergências
deliberadas (um teto conhecido aceito de propósito) devem ser marcadas com
comentário `ponytail:` nomeando o teto e o caminho de upgrade. Rationale: este é
um projeto de aprendizado — cada linha extra é uma linha a mais para entender e
explicar em entrevista, não uma feature a mais para vender.

### II. Harness Escrito à Mão (NÃO-NEGOCIÁVEL)
O loop do agente (`src/harness.ts`) é implementado manualmente — sem
LangChain/LangGraph/ADK ou qualquer framework de orquestração de agentes. É
permitido usar bibliotecas pontuais (SDK HTTP do LLM, parser de schema), mas o
loop decisório (montar contexto → chamar LLM → interpretar tool_call vs
resposta final → executar tool → repetir) deve ser código próprio e legível.
Rationale: o propósito pedagógico do projeto é entender e conseguir explicar
"o que é harness" numa entrevista; abstrair isso atrás de um framework anula o
objetivo do lab.

### III. Stack Zero-Custo
Toda peça da stack deve rodar sem custo de infraestrutura: LLM via NVIDIA NIM
free tier, embeddings locais (`@xenova/transformers`), vector store local em
arquivo (`vectra`), canal Telegram (Bot API gratuita, sem aprovação de negócio).
Novas dependências pagas ou que exijam infraestrutura hospedada (bancos
gerenciados, filas, etc.) requerem justificativa explícita e substituem uma
peça existente — não se somam à stack "por via das dúvidas".

### IV. RAG Multi-Fonte com Proveniência
O corpus de RAG aceita múltiplos documentos de origens diferentes (ex.:
regulamento PIX/Bacen + FAQ de faturamento da operadora) organizados em
`data/docs/<fonte>/`. Cada chunk indexado carrega metadado de origem
(`source`, `path`). Respostas fundamentadas em recuperação devem poder
referenciar de qual fonte o trecho veio. Rationale: permite responder
perguntas que cruzam fontes e demonstra domínio de RAG além de um único
documento — sem isso, "multi-fonte" vira só uma pasta com PDFs soltos.

### V. Qualidade "Prod-Relevante" Só Onde Importa
Aplicar rigor de produção apenas nos pontos que realmente importam: segredos
via variáveis de ambiente (nunca hardcoded), tratamento de erro/timeout/retry
simples nas chamadas ao LLM e na execução de tools, logging estruturado leve.
Docker, CI/CD, deploy hospedado, observabilidade externa (Grafana/Datadog) e
qualquer forma de multi-tenancy estão FORA de escopo — isso pertence a outro
projeto (infraestrutura "de verdade" é tratada no projeto-âncora fintech
separado). Rationale: "próximo de prod" aqui significa não escrever código
descartável nos pontos que um recrutador vai perguntar sobre, não replicar um
ambiente de produção real.

### VI. Teste Mínimo para Lógica Não-Trivial
Toda lógica não-trivial (chunking/retrieval, o loop do harness, parsing de
tool_call) sai acompanhada de pelo menos um teste mínimo baseado em `assert`
(script `*.test.ts` simples ou bloco `demo()`/`main` autoverificável) — sem
framework de testes pesado, sem fixtures, sem suíte por função. Código trivial
(getters, wiring, um-liners) não precisa de teste. Rationale: cobre o mínimo
para pegar regressão em decisões (branches, loops) sem impor cerimônia de
projeto de produção.

## Stack e Escopo Técnico

Node.js + TypeScript. Telegram via `grammy`. LLM via NVIDIA NIM (endpoint
OpenAI-compatible, key `nvapi-` já em uso no projeto irmão `pac-mentor`).
Embeddings via `@xenova/transformers` (local, sem custo de API). Vector store
via `vectra` (arquivo local). Corpus inicial: regulamento público PIX/Bacen +
FAQ de faturamento de uma operadora de telecom fictícia ("ConectaNet"),
organizados em `data/docs/<fonte>/`. Tools mockadas (sem integração externa
real): `consultar_status_fatura`, `abrir_ticket`. Fora de escopo: WhatsApp
(ver `docs/plano.md` para o motivo — risco de ban e proximidade indevida com
trabalho confidencial de terceiro), qualquer framework de agente pronto,
deploy hospedado.

## Persona e Domínio do Produto

O bot simula o atendimento financeiro de uma operadora de internet/telecom
**fictícia** ("ConectaNet") ao **cliente final** — não um bot de suporte a
desenvolvedor integrando uma API de pagamentos. A persona é inspirada no
fluxo real de faturamento de operadoras brasileiras (aba "Financeiro": 2ª
via de fatura, pagamento por PIX/boleto/cartão/débito automático, consulta
de status de pagamento, abertura de chamado sobre cobrança) — pesquisado
publicamente, sem usar nome, marca ou material interno de nenhuma empresa
real. Rationale: essa persona é universalmente reconhecível em entrevista
(qualquer pessoa entende "bot que responde dúvida de fatura e PIX de um
cliente"), evita depender de documentação de terceiro fora de contexto, e
mantém os dois tools (`consultar_status_fatura`, `abrir_ticket`) naturais
para quem os usa — sem precisar de nenhuma justificativa adicional de "por
que esse tool existe".

## Development Workflow

Fluxo Spec-Driven Development via GitHub Spec Kit:
`/speckit-constitution` (este documento) → `/speckit-specify` (spec da
feature) → `/speckit-plan` (plano técnico) → `/speckit-tasks` (quebra em
tasks executáveis) → `/speckit-implement` (execução). Escopo incremental em
três entregas demonstráveis independentemente: MVP (RAG puro) → v2 (+ tool
`consultar_status_fatura`) → v3 (+ tool `abrir_ticket` + loop
multi-turno completo) — ver `docs/plano.md`.

Commits em português, sem co-autoria da IA (nenhuma linha `Co-Authored-By:
Claude` ou equivalente). Repositório privado no GitHub
(`pedrolucazx/fintech-rag-agent`).

## Governance

Esta constituição tem precedência sobre decisões ad-hoc de implementação;
qualquer conflito entre um plano/task e um princípio aqui definido é resolvido
a favor da constituição, ou a constituição é emendada explicitamente antes de
prosseguir. Emendas são feitas re-executando `/speckit-constitution` com o
princípio a alterar, seguindo versionamento semântico: MAJOR para remoção ou
redefinição incompatível de princípio, MINOR para princípio novo ou expansão
material, PATCH para clarificação/redação. Specs e plans gerados pelo
`/speckit-plan` devem incluir uma checagem explícita de conformidade com os
Core Principles antes de avançar para tasks.

**Version**: 1.1.0 | **Ratified**: 2026-09-10 | **Last Amended**: 2026-09-10
