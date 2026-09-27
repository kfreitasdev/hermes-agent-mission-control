# Auditoria do onboarding — Glowryia Agents

**Data da verificação:** 2026-09-27 16:52 UTC  
**Referência:** `https://github.com/sharbelxyz/hermes-agent-mission-control/blob/main/ONBOARDING.md`  
**Ambiente:** `https://hermes.glowryia.com`

## Atualização pós-auditoria

Em 2026-09-27, a migration `0026_agent_mission_content_projection.sql` foi aplicada no Supabase e as telas legadas foram remapeadas do schema `public` para `agent_mission`. O build, os serviços, os endpoints internos e os ciclos de escrita/leitura das telas Ideas, Articles, Saved Titles, Longform, YouTube Scripts, X Content e Client Pulse passaram a ser verificáveis. O Bridge também recebeu tratamento para erros do pool PostgreSQL e foi reiniciado sem novos erros.

A auditoria funcional complementar está em [`docs/RUNTIME-AUDIT-2026-09-27.md`](./RUNTIME-AUDIT-2026-09-27.md). Ela encontrou e corrigiu a desconexão entre o Bridge e `AgentState`: a solicitação era concluída em Hermes, mas a tela Agents permanecia no roster padrão. O Bridge agora projeta `working`, `idle`, `error`, `currentTask`, atividades e contagem concluída, inclusive por reconciliação após restart.

O restante deste documento preserva o diagnóstico original para rastreabilidade. Itens que já foram fechados estão marcados na matriz e na seção de fechamento.

## Resultado executivo

A instalação operacional está concluída e o circuito website ↔ Supabase ↔ Hermes Bridge está ativo. O domínio responde, o OAuth Google está configurado, os dois serviços estão habilitados no systemd e existe evento recente `Bridge connected` no schema `agent_mission`.

Os gaps funcionais encontrados foram fechados nesta rodada com uma migration versionada e remapeamento do Prisma para `agent_mission`. Restam apenas a decisão de publicação dos commits no remote original e, se desejado, uma gravação real autorizada no Memory/Wiki.

## Checklist baseado no onboarding original

| Etapa | Situação | Evidência |
|---|---|---|
| 1. Pré-requisitos | **Concluída** | Node `v26.7.0`, Git `2.34.1`, Hermes resolvido em `/root/.hermes/.../bin/hermes`; conexão direta com Supabase disponível. |
| 2. Clone e dependências | **Concluída** | Checkout presente; `node_modules`, `package-lock.json` e `hermes-bridge/package-lock.json` presentes; bridge com `pg@8.23.0`. |
| 3. `.env` | **Concluída** | Variáveis core e bridge presentes; `.env` com permissão `600`; `DATABASE_URL` e `POSTGRES_URL` apontam para o mesmo endpoint sem expor credenciais. |
| 4. Banco | **Concluída com procedimento Glowryia** | Schema `agent_mission` presente com `briefs`, `data_store`, `events`, `hermes_tasks`, `memory_entries`, `missions` e `requests`; coluna `missions.agent_id` confirmada. Não foi usado `prisma db push`. |
| 5. Verificação local | **Substituída por verificação de produção** | `npm run build` passou; serviço Next.js ativo; login público respondeu HTTP `200`. O dev server local não é o runtime de produção. |
| 6. Deploy | **Concluída, mas diferente do onboarding original** | Deploy self-hosted via `hermy-hq.service`, proxy HTTPS e domínio `hermes.glowryia.com`; `/` redireciona para `/login` com HTTP `307`. Vercel não é o destino usado. |
| 7. Bridge | **Concluída** | `hermes-bridge.service` ativo e habilitado; usa `.env`, `HERMES_BIN` e `HERMES_WIKI`; espelha dados no Supabase. |
| 8. Bridge conectado | **Concluída** | Evento `status / Bridge connected` registrado em `agent_mission.events` em `2026-09-26 19:35:12 UTC`; existem projeções recentes de briefing, custo, crons e health. |

## Verificações executadas

- `npm run build`: passou com Next.js `16.1.6` e geração das 44 páginas estáticas.
- `hermy-hq.service`: `active`, `enabled`.
- `hermes-bridge.service`: `active`, `enabled`.
- `https://hermes.glowryia.com/login`: HTTP `200`.
- `https://hermes.glowryia.com/`: HTTP `307` para `/login`.
- `/api/auth/providers`: HTTP `200`, provider Google presente.
- `/api/auth/session`: HTTP `200`, sessão anônima sem usuário.
- `agent_mission.events`: 9 eventos; o mais recente de conexão do bridge está presente.
- `agent_mission.data_store`: 5 projeções (`hermes-briefing`, `hermes-cost`, `hermes-crons`, `hermes-health`, `metric-snapshots`).
- `agent_mission.hermes_tasks`: 5 tarefas espelhadas.
- `agent_mission.requests`: 1 request concluído (`briefing.generate`).
- `git diff --check`: passou.
- Nenhum segredo foi incluído neste relatório.

## Gaps encontrados

### P0 — nenhum bloqueador da instalação

Não há bloqueador P0 para o runtime atual.

### P1 — fechado nesta rodada (diagnóstico histórico)

1. **Persistência legada em telas de conteúdo**
   - Os modelos que não existiam em `public` foram criados como projeções cockpit-owned em `agent_mission` pela migration `0026_agent_mission_content_projection.sql`.
   - O Prisma foi remapeado para o schema `agent_mission` sem duplicar os domínios canônicos de `public`.
   - O ciclo de escrita/leitura foi exercitado para Ideas, Articles, Saved Titles, Longform, YouTube Scripts e X Content.

2. **Agents**
   - `AgentState` está em `agent_mission` e o endpoint retorna os oito Profiles sem `P2021`.
   - O Bridge agora atualiza e reconcilia o estado real de cada Profile a partir de requests/eventos; a execução real de `glowryia` foi lida de volta como `idle`, com `tasksCompleted=3` e atividades registradas.

3. **Auditoria end-to-end das telas**
   - O smoke autenticado por `x-internal-secret` cobriu criação, leitura posterior, atualização e limpeza nos módulos mutáveis.
   - Client Pulse foi exercitado com `map-chat` usando o segredo administrativo e leitura posterior.
   - A inspeção visual autenticada no navegador permanece opcional; a CLI de Browser Use não está instalada neste host.

### P2 — observação e decisões restantes

1. **Bridge teve 3 reinícios anteriores**
   - O tratamento para evento de erro do pool foi adicionado e o serviço foi reiniciado.
   - Estado atual: `active`, `ExecMainStatus=0`, `NRestarts=0` desde o novo rollout.

2. **Memory/Wiki sem conteúdo sincronizado**
   - `/root/.hermes/wiki` foi inicializado como repositório Git e permanece sem conteúdo artificial.
   - A gravação real de `memory.write` continua aguardando conteúdo autorizado; não é um bloqueador técnico da instalação.

3. **Documentação de deploy**
   - **Fechado:** README e ONBOARDING agora documentam o deploy self-hosted via systemd + proxy HTTPS e mantêm Vercel como alternativa.

4. **Código publicado no fork do time**
   - O checkout usa `origin=https://github.com/kfreitasdev/hermes-agent-mission-control` e `upstream=https://github.com/sharbelxyz/hermes-agent-mission-control`.
   - A base auditada foi publicada no fork do time; alterações desta auditoria serão publicadas após os gates finais.

5. **Lint histórico do projeto**
   - `npm run lint` ainda falha com 123 erros e 46 warnings espalhados pelo código legado.
   - `npm run build`, `npx prisma validate`, `git diff --check` e os testes focados desta rodada passam.
   - A limpeza integral do lint não foi misturada à correção de persistência para evitar alteração ampla não relacionada.

## Fechamento pós-ajustes

- **Fechado:** migration versionada `0026_agent_mission_content_projection.sql` aplicada e lida de volta no Supabase.
- **Fechado:** Prisma remapeado para `agent_mission` nos modelos de conteúdo e estado que não existiam em `public`.
- **Fechado:** API smoke com escrita → leitura posterior → atualização → limpeza para Ideas, Articles, Saved Titles, Longform, YouTube Scripts e X Content.
- **Fechado:** Client Pulse `map-chat` com autorização administrativa e leitura posterior.
- **Fechado:** Agents, Home, Score e Client Pulse retornando payloads válidos pelo endpoint interno.
- **Fechado:** pool do Bridge protegido contra evento de erro não tratado; serviço reiniciado com `NRestarts=0`.
- **Fechado:** Bridge ↔ AgentState conectado; Profile em execução, tarefa atual, erro, atividade e contagem são projetados no Supabase e reconciliados após restart.
- **Fechado:** README e ONBOARDING atualizados para o deploy self-hosted real, mantendo Vercel como alternativa.
- **Fechado:** base anterior publicada no fork privado do time `kfreitasdev/hermes-agent-mission-control`.
- **Pendente por autorização de conteúdo:** uma gravação real e permanente no Memory/Wiki. O diretório foi inicializado como repositório Git, mas não foi criada memória artificial apenas para teste.

A instalação e os módulos de persistência auditados estão prontos para revisão final. O quadro `/tasks` continua sendo planejamento independente; a execução real e o estado dos Profiles são acompanhados em Hermes e na tela Agents.
