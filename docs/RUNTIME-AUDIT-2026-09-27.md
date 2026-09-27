# Auditoria funcional do Mission Control — 2026-09-27

## Escopo

Auditoria do circuito original do Hermes Agent Mission Control após as adaptações para:

- Supabase compartilhado com schema `agent_mission`;
- deployment self-hosted via systemd + proxy HTTPS;
- oito Profiles persistentes, com `glowryia` como orquestradora;
- interface localizada e rebranded como Glowryia Agents;
- projeções de conteúdo e tarefas no schema operacional.

A referência arquitetural original é o repositório `sharbelxyz/hermes-agent-mission-control`, especialmente o fluxo website → `requests` → Bridge → Hermes CLI → eventos/projeções.

## Matriz de cobertura

| Capacidade | Evidência atual | Estado |
|---|---|---|
| Login e rota protegida | `/login` HTTP 200; `/` HTTP 307 para login; provider Google presente | Coberto |
| Website → fila | `agentRequest` grava em `agent_mission.requests` com `target_profile`, `handoff`, `status` e `side_effecting` | Coberto |
| Aprovação humana | Inbox altera `awaiting_approval` para `approved`; Bridge não coleta solicitações aguardando aprovação | Coberto |
| Polling do Bridge | `hermes-bridge.service` ativo, `BRIDGE_POLL_MS=5000` e eventos `Bridge connected` | Coberto |
| Allowlist de Profiles | oito IDs validados no endpoint e novamente no Bridge antes de `hermes -p` | Coberto |
| Execução | Bridge marca `running`, executa o CLI e grava `done`/`failed`, resultado e timestamps | Coberto |
| Eventos de execução | cada request executado possui evento `Started:` e evento terminal `Done:`/`Failed:` | Coberto |
| Visibilidade na tela Hermes | solicitação mostra Profile alvo e status; `running` possui indicador visual pulsante | Coberto |
| Visibilidade na tela Agents | Bridge agora projeta estado, tarefa atual, última atividade e contagem concluída em `AgentState` | Corrigido nesta auditoria |
| Reconciliação após restart | Bridge reconstrói `AgentState` a partir de requests/eventos históricos no ciclo de mirror | Corrigido nesta auditoria |
| Espelho do Kanban Hermes | Bridge grava `hermes_tasks` e a tela Hermes consulta essa projeção | Coberto |
| Quadro `/tasks` | usa `agent_mission.missions` como quadro de planejamento independente | Manual/intencional |
| Tarefa → execução automática | não existe por decisão operacional; aprovação do card não cria request automaticamente | Fora do escopo atual |
| Memory/Wiki | Markdown em `/root/.hermes/wiki`, commit Git local e projeção `memory_entries` no Supabase | Coberto estruturalmente |
| Garden | `agent_mission.data_store` com chave estável `shared-garden` | Coberto |
| Conteúdo legado | migration `0026` + mappings Prisma em `agent_mission`; smoke CRUD/read-back executado | Coberto |
| Persistência pós-reload | endpoints críticos usam leitura posterior e `cache: no-store` onde necessário | Coberto nos módulos auditados |
| Serviço persistente | `hermy-hq.service` e `hermes-bridge.service` ativos, `NRestarts=0` após rollout | Coberto |
| Auditoria visual autenticada completa | Browser Use CLI não instalado neste host | Não verificado |

## Desconexão encontrada e correção

A auditoria reproduziu o caso observado pelo operador:

1. a solicitação era executada pelo Bridge e aparecia como concluída na tela Hermes;
2. `agent_mission.events` registrava `Started: glowryia` e `Done: glowryia`;
3. `agent_mission."AgentState"` permanecia vazio;
4. a tela Agents usava o roster padrão, sem Profile trabalhando, tarefa atual ou contagem real.

A causa era que o Bridge atualizava somente `requests` e `events`. Ele não projetava o ciclo de execução para `AgentState`, embora a tela Agents lesse exclusivamente essa tabela.

Correção aplicada:

- criado `hermes-bridge/agent-state.mjs` com metadados e transições testáveis;
- ao iniciar request, o Profile passa a `working` com `currentTask`;
- ao concluir, passa a `idle`, limpa a tarefa atual e incrementa `tasksCompleted`;
- ao falhar, passa a `error` e registra a atividade;
- no ciclo de mirror, requests/eventos históricos reconciliam `AgentState`, inclusive após reinício do Bridge;
- a tela `/tasks` recebeu uma explicação explícita de que seu quadro é planejamento e que a execução aparece em Hermes.

Estado read-back após o rollout:

```text
AgentState: glowryia | idle | currentTask vazio | tasksCompleted=3 | activity_count=6
Requests: total=3 | queued=0 | awaiting=0 | approved=0 | running=0 | done=3 | failed=0
```

A tarefa de planejamento observada continua `Approved`, conforme a decisão de não ligar automaticamente o quadro ao executor.

## Verificações executadas

```text
node --check hermes-bridge/bridge.mjs
node --test scripts/agent-state.test.mjs scripts/bridge-connection.test.mjs \
  scripts/bridge-pool-errors.test.mjs scripts/mission-content-contract.test.mjs
npx tsx --test scripts/mission-profiles.test.ts
npx prisma validate
npm run build
node --env-file=.env scripts/mission-runtime-audit.mjs
systemctl restart hermes-bridge.service hermy-hq.service
# ou, após o rollout: npm run audit:runtime
```

Resultado do auditor de runtime:

```json
{"ok":true,"requests":{"total":3,"queued":0,"awaiting":0,"approved":0,"running":0,"done":3,"failed":0},"failures":[]}
```

Também confirmado:

- serviços `active`;
- `NRestarts=0` e `ExecMainStatus=0`;
- `/login` HTTP 200;
- `/` HTTP 307 para `/login`;
- nenhum novo erro de sincronização de AgentState após o restart;
- `git diff --check` sem erros.

## Pendências separadas

- `npm run lint` continua com a dívida histórica do repositório original: 123 erros e 46 warnings; não foram introduzidos erros de lint no build TypeScript desta correção.
- A auditoria visual autenticada tela a tela não foi executada porque o Browser Use CLI não está instalado neste host.
- O quadro `/tasks` continua deliberadamente independente do executor Hermes; para iniciar trabalho real, deve-se criar uma solicitação com prompt/handoff e acompanhar o ciclo em Hermes.
- Não foi criada memória artificial apenas para teste. A cadeia de gravação autorizada permanece disponível, mas a fonte Markdown não deve ser poluída com fixtures.
