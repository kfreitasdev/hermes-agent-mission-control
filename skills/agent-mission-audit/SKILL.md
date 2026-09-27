---
name: agent-mission-audit
description: Audite Agent Mission com evidência e gates seguros.
version: 0.1.0
author: Kleber Freitas, Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [agent-mission, bridge, supabase, profiles, audit]
    related_skills: []
---

# Agent Mission Audit Skill

Audita uma instalação Glowryia Agents formada por Next.js, Supabase/PostgreSQL, Hermes Bridge e Profiles persistentes. O procedimento separa intenção, execução, tentativa, evento e `AgentState`, preserva `glowryia` como orquestradora e não executa efeitos externos sem autorização explícita.

## Quando usar

- Quando uma adaptação do Agent Mission pode ter deixado rotas, tabelas, Profiles ou Bridge desconectados.
- Quando for necessário verificar o fluxo `AgentRequest → aprovação → claim → Profile → lifecycle → AgentState`.
- Quando uma integração externa, especialmente NotebookLM, precisa de prova estruturada e read-back.
- Não usar para executar tarefas Hermes reais, criar notebooks ou escrever memória apenas para gerar evidência.

## Pré-requisitos

- Repositório clonado e branch/remote confirmados.
- `.env` local protegido; nunca imprimir `DATABASE_URL`, tokens, client secrets ou cookies.
- PostgreSQL/Supabase existente e schema `agent_mission` identificados.
- Node, Prisma e Hermes CLI disponíveis no host do Bridge.
- Acesso aos serviços `hermes-bridge.service` e `hermy-hq.service` quando a instalação for systemd.
- Aprovação humana separada para qualquer efeito externo.

## Contrato operacional

- Profiles válidos: `glowryia`, `max`, `nova`, `atlas`, `lia`, `iris`, `lex`, `pulse`.
- `glowryia` é a orquestradora; `delegate_task` do ambiente não aciona Profiles da aplicação.
- Requests entram como `awaiting_approval` e somente `approved` pode ser reivindicado pelo Bridge.
- `queued` não é estado executável.
- Toolsets `kanban`, `cronjob`, `memory`, briefing e NotebookLM ficam em `glowryia`.
- NotebookLM operacional usa `notebooklm-safe`, nunca o MCP completo.
- Tarefa do quadro e request Hermes não são a mesma entidade.
- Não há fan-out automático entre os Profiles.

## Procedimento

1. **Fixe o escopo e a proveniência.** Leia `README.md`, `ONBOARDING.md`, `hermes-bridge/README.md` e a migration manifest. Confirme que o remote de publicação é o fork autorizado e que o upstream não será alterado.
2. **Mapeie o banco.** Consulte somente `information_schema`, `pg_class` e `pg_policies` para confirmar tabelas, colunas, `@map`, schema `agent_mission`, RLS e policies. Nunca use `prisma db push` em banco compartilhado.
3. **Mapeie a API.** Confirme rotas de dispatch, aprovação/rejeição, chat, briefing, cron, memória e leitura de requests. Verifique CAS, ator, idempotência, Profile alvo e que o cliente não controla livremente `side_effecting`.
4. **Mapeie o Bridge.** Confirme claim transacional de requests `approved`, criação de `execution_attempts`, lease, `Started` na mesma transação, execução com `-p <profile>` e toolsets allowlisted, terminalização transacional e redaction.
5. **Mapeie o estado.** Confirme que `/api/agents` é somente leitura e que `AgentState` é projeção do Bridge, reconciliável após restart e sem fallback que apresente estado fictício.
6. **Mapeie Memory/Wiki.** Confirme Markdown/Git local como fonte quente, `memory_entries` como projeção e `memory.write` como request aprovado. Teste traversal com caminhos relativos, absolutos, `..`, extensões inválidas e symlinks sem criar conteúdo institucional.
7. **Mapeie NotebookLM.** Confirme o Profile `glowryia`, auth existente em `default`, fachada com quatro ferramentas, operação declarada, snapshot pré-operação, JSON estruturado e read-back pós-operação. Não crie notebook durante auditoria read-only.
8. **Execute gates locais.** Rode apenas os checks necessários para o escopo: `node --check`, testes Node/TypeScript, `tsc --noEmit`, `prisma validate`, build e `git diff --check`. Diferencie build local de runtime publicado.
9. **Execute gates vivos read-only.** Rode `npm run audit:runtime`, `npm run audit:notebooklm`, `systemctl is-active` e smoke HTTPS. Verifique `NRestarts`, status do processo, `/login` e redirect da raiz sem desabilitar TLS.
10. **Classifique o resultado.** Marque cada item como `coberto`, `parcial`, `ausente`, `manual` ou `não verificado`. Não transforme ausência de autorização para uma tarefa externa em sucesso fictício.
11. **Corrija uma causa por vez.** Escreva regression test/contract test quando possível, aplique migration SQL versionada quando necessário e preserve a separação de domínios.
12. **Publique somente no fork.** Após os gates solicitados, faça commit com mensagem objetiva e `git push origin <branch>`. Nunca publique no upstream original.

## Verificação

Considere a rodada operacional aprovada somente quando:

- o build e os testes locais passam;
- migrations e Prisma concordam com o banco vivo;
- não existem requests `queued`, `approved` ou `running` órfãs;
- cada Profile possui estado persistido coerente;
- requests terminalizadas possuem evento terminal e tentativa coerente;
- RLS e policies estão presentes;
- NotebookLM passa no audit read-only;
- serviços estão ativos sem restart loop;
- HTTPS e redirect de login respondem corretamente;
- commits e remote apontam para o fork autorizado.

Isso não autoriza executar uma tarefa Hermes real. Para validar efeitos externos, abra uma decisão humana separada, registre o escopo e faça read-back do efeito exato.

## Pitfalls

- Não confunda `delegate_task` com o acionamento dos Profiles da aplicação.
- Não faça fan-out automático ao aprovar uma tarefa do quadro.
- Não aceite texto do modelo como prova de criação externa.
- Não considere `done` prova de sucesso sem IDs/read-back quando houver efeito externo.
- Não trate RLS habilitado sem policies como fronteira suficiente.
- Não use `queued` como fallback silencioso.
- Não persista stderr bruto, URLs com query, tokens ou connection strings.
- Não execute `prisma db push` no Supabase compartilhado.
- Não crie memória artificial ou NotebookLM artificial apenas para passar um teste.
- Não declare o domínio publicado apenas porque um processo local está ativo; verifique HTTPS e o endpoint real.
