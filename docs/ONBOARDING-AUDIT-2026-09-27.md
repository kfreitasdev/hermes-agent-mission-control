# Auditoria do onboarding — Glowryia Agents

**Data da verificação:** 2026-09-27 16:52 UTC  
**Referência:** `https://github.com/sharbelxyz/hermes-agent-mission-control/blob/main/ONBOARDING.md`  
**Ambiente:** `https://hermes.glowryia.com`

## Resultado executivo

A instalação operacional está concluída e o circuito website ↔ Supabase ↔ Hermes Bridge está ativo. O domínio responde, o OAuth Google está configurado, os dois serviços estão habilitados no systemd e existe evento recente `Bridge connected` no schema `agent_mission`.

O que ainda impede declarar o produto completo não é a instalação base: são gaps funcionais de telas que ainda apontam para modelos legados em `public` ausentes no banco atual, além de documentação ainda orientada a Vercel enquanto o ambiente instalado usa systemd + proxy HTTPS.

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

### P1 — corrigir antes de declarar o produto completo

1. **Persistência legada em telas de conteúdo**
   - `public.Idea` não existe.
   - `public.Article` não existe.
   - `public.SavedTitle` não existe.
   - `public.LongformScript` não existe.
   - `public.YoutubeScript` não existe.
   - `public.ClientPulseAnalysis` não existe.
   - `public.Draft` não existe para X Content.

   Essas telas podem abrir, mas operações de gravação não estão apoiadas por tabelas presentes no banco vigente. O próximo trabalho deve escolher, por módulo, entre migrar para `agent_mission`/`data_store` ou criar migrations SQL versionadas no schema canônico apropriado. Não usar `prisma db push`.

2. **Agents ainda consulta `public.AgentState`**
   - A API registra `P2021` porque a tabela não existe.
   - O roster visual padrão funciona, mas estados persistidos dos agentes não estão confirmados.
   - Deve ser adaptado ao roster/projeção do Agent Mission ou receber uma tabela versionada aprovada.

3. **Auditoria end-to-end das telas**
   - Ainda falta testar com sessão autenticada, por módulo, o ciclo: criar → recarregar → ler novamente → atualizar/excluir quando aplicável.
   - Prioridade: Ideas, Articles, Longform, YouTube Scripts, X Content, Client Pulse, Tasks e Memory/Wiki.
   - Não executar requests reais de Profiles apenas para teste; usar fixtures ou operações explicitamente autorizadas.

### P2 — operação e documentação

1. **Bridge teve 3 reinícios anteriores**
   - O serviço está saudável agora e o último processo está ativo.
   - O journal registra falhas transitórias de conexão do pool PostgreSQL (`db_connection_closed_in_auth`, `ECONNRESET`) antes do último restart.
   - Vale adicionar tratamento de erro/reconexão do pool e um health check operacional para evitar que uma conexão ociosa derrube o processo.

2. **Memory/Wiki sem conteúdo sincronizado**
   - `agent_mission.memory_entries` está vazio e `/root/.hermes/wiki` ainda não possui `.git`.
   - A capacidade está implementada no bridge, mas falta uma gravação autorizada de `memory.write` para validar o caminho completo. Não criar uma gravação artificial sem autorização.

3. **Documentação de deploy diverge do ambiente**
   - O onboarding original descreve Vercel.
   - O ambiente real usa `hermy-hq.service` + proxy HTTPS + `hermes.glowryia.com`.
   - Este relatório registra a divergência; o onboarding deve ganhar uma seção de deployment self-hosted ou marcar Vercel como alternativa.

4. **Código local não está sincronizado com `origin/main`**
   - O checkout local está 16 commits à frente do `origin/main`.
   - As correções estão no servidor e no checkout local, mas ainda não foram publicadas no repositório remoto original. Fazer push somente após revisão explícita do usuário.

## Próxima ordem recomendada

1. Aprovar o contrato de persistência para cada módulo legado.
2. Criar migrations SQL versionadas e adaptar APIs, começando por Ideas e Articles.
3. Executar a auditoria autenticada de ciclo completo em todas as telas.
4. Corrigir o tratamento de reconexão do bridge e validar `NRestarts=0` após observação.
5. Atualizar o onboarding para documentar o deployment self-hosted real.
6. Só então declarar o produto completo e decidir se os 16 commits devem ser publicados no repositório remoto.
