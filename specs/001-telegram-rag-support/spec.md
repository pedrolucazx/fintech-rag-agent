# Feature Specification: Agente de Suporte Fintech via Telegram (RAG + Tools)

**Feature Branch**: `001-telegram-rag-support`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "Bot de suporte no Telegram que simula um agente de fintech: responde dúvidas sobre integração de pagamento (PIX) usando RAG em cima de documentação real de múltiplas fontes (PIX/Bacen, Celcoin, Stripe), e também consegue executar ações via tool-calling — consultar status de uma transação e abrir um chamado de suporte. Projeto de aprendizado/portfólio, não é serviço real."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Responder dúvidas fundamentadas em documentação (Priority: P1)

Um usuário conversa com o bot no Telegram e pergunta algo sobre integração de
pagamentos (ex.: "como funciona a idempotência de webhook?" ou "quais são os
tipos de chave PIX?"). O bot responde com base no conteúdo real da
documentação indexada, e não com conhecimento genérico do modelo.

**Why this priority**: É o valor central do produto — sem isso não há "agente
de suporte", só um chatbot genérico. É a entrega mínima que já demonstra RAG
funcionando de ponta a ponta.

**Independent Test**: Enviar uma pergunta cuja resposta correta só existe na
documentação indexada (não é conhecimento geral) e verificar que a resposta
do bot reflete o conteúdo específico do documento, incluindo de qual fonte
veio a informação quando perguntas cruzam mais de um documento.

**Acceptance Scenarios**:

1. **Given** a documentação de PIX/Bacen está indexada, **When** o usuário
   pergunta sobre um detalhe específico coberto nela, **Then** o bot responde
   com informação correspondente ao conteúdo do documento.
2. **Given** documentos de mais de uma fonte estão indexados (ex.: Celcoin e
   Stripe), **When** o usuário faz uma pergunta que só uma das fontes
   responde, **Then** o bot usa a fonte correta e não mistura informação de
   fontes irrelevantes.
3. **Given** o usuário pergunta algo que não está coberto em nenhuma
   documentação indexada, **When** o bot não encontra contexto relevante,
   **Then** o bot informa que não tem essa informação em vez de inventar uma
   resposta.

---

### User Story 2 - Consultar status de uma transação (Priority: P2)

Um usuário pergunta pelo status de uma transação específica (ex.: "qual o
status da transação 12345?"). O bot identifica que precisa executar uma
consulta (não apenas responder com texto) e retorna o status.

**Why this priority**: Demonstra a diferença entre "responder com base em
documentos" (RAG) e "agir sobre um sistema" (ação real) — é o que separa um
agente de um buscador de documentos.

**Independent Test**: Perguntar pelo status de uma transação e verificar que
o bot retorna um status (ainda que de dado simulado), não uma resposta
genérica de RAG.

**Acceptance Scenarios**:

1. **Given** o usuário informa um identificador de transação, **When**
   pergunta o status, **Then** o bot retorna um status correspondente àquele
   identificador.
2. **Given** o usuário pergunta pelo status sem informar um identificador,
   **When** o bot não tem essa informação, **Then** o bot pede o
   identificador antes de tentar consultar.

---

### User Story 3 - Abrir um chamado de suporte (Priority: P3)

Um usuário relata um problema (ex.: "minha transação não caiu, preciso de
ajuda") e pede para abrir um chamado. O bot registra o chamado com um
resumo do problema e confirma a abertura, mantendo o fio da conversa
(múltiplas mensagens) até reunir as informações necessárias.

**Why this priority**: Completa o ciclo de agente real: RAG (responder),
consulta (agir/ler estado) e agora escrita/efeito colateral (agir/mudar
estado), além de exercitar continuidade de conversa em várias mensagens
(multi-turno), não só um par pergunta-resposta.

**Independent Test**: Descrever um problema e pedir abertura de chamado;
verificar que um registro é criado com assunto e descrição capturados da
conversa, e que o bot confirma ao usuário com alguma referência ao chamado
criado.

**Acceptance Scenarios**:

1. **Given** o usuário descreve um problema e pede para abrir um chamado,
   **When** o bot tem assunto e descrição suficientes, **Then** um chamado é
   registrado e o bot confirma a abertura.
2. **Given** o usuário pede para abrir um chamado mas não descreveu o
   problema, **When** o bot não tem informação suficiente, **Then** o bot
   pergunta o que falta antes de registrar o chamado.
3. **Given** uma conversa em andamento (ex.: o usuário já perguntou o status
   de uma transação), **When** o usuário emenda pedindo abertura de chamado
   sobre a mesma transação, **Then** o bot usa o contexto já estabelecido na
   conversa (não pede novamente o identificador já informado).

### Edge Cases

- O que acontece quando o usuário faz uma pergunta ambígua que poderia ser
  respondida tanto por documentação quanto por consulta de transação?
- Como o sistema se comporta se a chamada ao modelo de linguagem falhar ou
  demorar além do esperado?
- O que acontece se o usuário pedir uma ação que o bot não sabe realizar
  (fora do conjunto de ações disponíveis)?
- Como o bot responde a uma pergunta totalmente fora do domínio de
  pagamentos/suporte (ex.: assunto não relacionado)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE responder perguntas do usuário com base em
  conteúdo recuperado de documentação indexada, quando a pergunta for
  coberta por essa documentação.
- **FR-002**: O sistema DEVE suportar documentação de múltiplas fontes
  distintas simultaneamente, e cada resposta fundamentada DEVE poder indicar
  de qual fonte a informação usada foi extraída.
- **FR-003**: O sistema DEVE reconhecer quando uma pergunta não é coberta
  pela documentação indexada e comunicar isso ao usuário em vez de responder
  com informação não verificada.
- **FR-004**: O sistema DEVE permitir consultar o status de uma transação a
  partir de um identificador informado pelo usuário.
- **FR-005**: O sistema DEVE permitir registrar um chamado de suporte a
  partir de uma descrição de problema fornecida pelo usuário, capturando
  minimamente um assunto e uma descrição.
- **FR-006**: O sistema DEVE manter o contexto da conversa entre múltiplas
  mensagens de um mesmo usuário, de forma que informações já fornecidas
  (ex.: identificador de transação) não precisem ser repetidas.
- **FR-007**: O sistema DEVE decidir dinamicamente, para cada mensagem do
  usuário, se a resposta correta é: (a) responder com base em documentação,
  (b) executar uma ação disponível, ou (c) pedir mais informação — sem que
  essa decisão seja um fluxo fixo predefinido por palavra-chave.
- **FR-008**: O sistema DEVE operar através do aplicativo Telegram, tratando
  cada conversa individual (chat) como uma sessão separada.

### Key Entities

- **Documento de referência**: conteúdo de uma fonte de documentação (ex.:
  PIX/Bacen, Celcoin, Stripe) indexado para consulta; possui uma fonte de
  origem identificável.
- **Conversa**: sequência de mensagens trocadas entre um usuário e o bot em
  um chat do Telegram; mantém o histórico necessário para dar continuidade
  ao atendimento.
- **Transação (simulada)**: registro fictício de pagamento, identificável
  por um identificador único, consultável por status.
- **Chamado de suporte**: registro criado a partir de uma solicitação do
  usuário, contendo assunto e descrição do problema relatado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário consegue obter uma resposta fundamentada em
  documentação para uma pergunta coberta pelo corpus indexado em uma única
  interação (uma pergunta, uma resposta), sem precisar reformular.
- **SC-002**: Ao perguntar algo coberto por mais de uma fonte de
  documentação, a resposta reflete corretamente qual fonte é relevante para
  a pergunta feita.
- **SC-003**: Um usuário consegue consultar o status de uma transação e
  receber um resultado determinístico para o identificador informado.
- **SC-004**: Um usuário consegue abrir um chamado de suporte descrevendo um
  problema em linguagem natural, sem preencher um formulário estruturado, e
  recebe confirmação de que o chamado foi registrado.
- **SC-005**: Numa conversa de múltiplas mensagens sobre o mesmo assunto, o
  usuário não precisa repetir uma informação já fornecida anteriormente na
  mesma conversa.
- **SC-006**: Ao perguntar algo fora do domínio de pagamentos/suporte ou não
  coberto pela documentação, o usuário recebe uma resposta que deixa claro
  que aquela informação não está disponível, em vez de uma resposta
  inventada.

## Assumptions

- É um projeto de laboratório/portfólio, não um serviço real de suporte —
  transações e chamados são simulados, sem integração com sistemas de
  pagamento reais.
- Um único usuário conversa por vez em cada chat do Telegram; não há
  requisito de atendimento simultâneo de múltiplos operadores humanos.
- O corpus de documentação inicial cobre PIX/Bacen, Celcoin e Stripe; novas
  fontes podem ser adicionadas sem alterar o comportamento esperado do
  sistema.
- Não há requisito de autenticação de usuário — qualquer pessoa que converse
  com o bot no Telegram é atendida da mesma forma.
- "Consultar status de transação" e "abrir chamado" operam sobre dados
  simulados mantidos pelo próprio sistema, não sobre uma API de pagamento
  real.
