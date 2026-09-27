# Resumo da auditoria — Glowryia Agents

**Data de referência:** 27/09/2026  
**Repositório da aplicação:** `kfreitasdev/hermes-agent-mission-control`  
**Repositório das migrations:** `kfreitasdev/glowryia-console`  
**Fork autorizado:** `https://github.com/kfreitasdev/hermes-agent-mission-control`

## Resultado executivo

A aplicação foi alinhada ao fluxo de Agent Mission com **Glowryia como orquestradora**, oito Profiles persistentes e execução pelo Bridge somente após aprovação explícita. O runtime publicado foi recompilado, os serviços foram reiniciados e as auditorias operacionais passaram.

Nenhuma tarefa Hermes real nova ou criação de NotebookLM foi executada durante a manutenção. Portanto, os efeitos externos permanecem protegidos por aprovação e não foram validados com uma operação real não autorizada.

## Arquitetura consolidada

```text
Interface/API
    ↓
AgentRequest (awaiting_approval)
    ↓ aprovação CAS + evento de decisão
AgentRequest (approved)
    ↓ claim transacional pelo Bridge
ExecutionAttempt (lease + claimed_by)
    ↓
hermes -p <target_profile> -t <toolsets allowlisted> -z ...
    ↓
Started → Done/Failed + AgentState
```

- O quadro e o request Hermes são entidades separadas.
- Aprovar uma tarefa do quadro não inicia automaticamente um Profile.
- `delegate_task` é delegação interna do ambiente de desenvolvimento; não aciona os Profiles da aplicação.
- O Agent Mission original não possui fan-out automático entre os oito agentes. A aplicação mantém essa decisão.
- O `target_profile` pode ser `glowryia`, `max`, `nova`, `atlas`, `lia`, `iris`, `lex` ou `pulse`.
- `kanban`, `cron`, `memory`, briefing e NotebookLM são operações de orquestração limitadas ao Profile `glowryia`.

## Correções aplicadas

### Execução e lifecycle

- Execução restrita a requests `approved` e a kinds/toolsets allowlisted.
- Estado legado `queued` migrado para `awaiting_approval` e removido da constraint operacional.
- Criada a tabela `agent_mission.execution_attempts` com tentativa, lease, `claimed_by`, resultado, erro e timestamps.
- Claim do Bridge cria a tentativa e o evento `Started` na mesma transação.
- Terminalização atualiza request, tentativa e evento `Done`/`Failed` de forma transacional.
- Requests com lease expirado são marcadas como falha e a tentativa é encerrada como `expired`.
- CAS aplicado às decisões e à terminalização para evitar eventos contraditórios.
- `AgentState` passou a ser projeção do Bridge; a rota manual de escrita foi removida.

### Segurança e fronteiras

- Toolsets de orquestração são rejeitados para Profiles especialistas.
- `side_effecting` não é controlado livremente pelo chamador.
- Briefing usa somente `context_engine` read-only e depende de request aprovado.
- Erros persistidos/logados passam por redaction de URLs, tokens, credenciais, connection strings e caminhos sensíveis.
- RLS permanece habilitado em `agent_mission`, com policies deny-by-default para `anon` e `authenticated`.
- O operador server-side do Bridge/API continua sendo a fronteira de escrita controlada.
- Wiki restringe caminhos relativos Markdown e rejeita traversal, caminhos absolutos e escapes por symlink.
- TLS do Bridge exige verificação de certificado.

### NotebookLM

- MCP completo permanece disponível apenas para inspeção.
- O Bridge usa a fachada operacional `notebooklm-safe`, com quatro capacidades restritas.
- Requests NotebookLM precisam declarar operação segura: `create_notebook`, `add_source`, `list_notebooks` ou `list_sources`.
- `create_notebook` e `add_source` exigem resultado JSON estruturado.
- O Bridge executa snapshot antes da operação e read-back depois da operação.
- IDs antigos não são aceitos como prova de mutação nova; título e URL declarados são comparados quando fornecidos.
- O Profile executor é `glowryia`; a autenticação NotebookLM existente permanece no perfil `default`.

### Dados e deployment

- Projeções legadas foram direcionadas ao schema `agent_mission` sem duplicar tabelas canônicas de `public`.
- Garden usa `agent_mission.data_store` com chave estável `shared-garden`.
- Memory/Wiki usa Markdown/Git local como fonte quente e `memory_entries` como projeção.
- Migrations versionadas `0027`, `0028`, `0029`, `0030` e `0031` foram aplicadas ao Supabase existente.
- HTTPS ativo em `https://hermes.glowryia.com`.
- Serviços systemd usados: `hermes-bridge.service` e `hermy-hq.service`.

## Evidências operacionais

Última auditoria de runtime:

```json
{
  "ok": true,
  "requests": {
    "total": 6,
    "queued": 0,
    "awaiting": 0,
    "approved": 0,
    "running": 0,
    "done": 5,
    "failed": 1
  },
  "failures": []
}
```

Auditoria NotebookLM:

- servidor completo: 13 ferramentas conectado;
- fachada segura: 4 ferramentas conectada;
- autenticação válida;
- nenhuma criação nova executada.

Smoke HTTPS:

- `/login`: `200`;
- `/`: `307` para `/login`.

## Commits publicados

Aplicação:

```text
23eb2d6 fix: atomically record execution start
```

Commits anteriores relevantes:

```text
e312e7e fix: constrain NotebookLM operations
a0620ac fix: close mission lifecycle and execution gaps
bb140c1 fix: harden approved agent mission execution
91d0962 fix: project bridge execution state to agents
```

Migrations/contratos no Console:

```text
85ef392 feat: harden agent mission database lifecycle
```

## Limites conhecidos

- Nenhuma execução Hermes real nova foi autorizada para o smoke test; não criar tarefas ou notebooks apenas para gerar evidência.
- O fan-out entre Profiles não é comportamento existente nem deve ser assumido.
- `npm run lint` continua com dívida histórica do template original; build e TypeScript passam.
- A validação visual autenticada tela a tela não faz parte deste resumo operacional; a validação HTTPS/API e os audits read-only são as evidências registradas.
- A senha de proteção contra vazamento do Supabase continua sendo uma recomendação pendente do provedor.

## Como continuar com segurança

1. Leia `ONBOARDING.md` e `hermes-bridge/README.md` antes de alterar o runtime.
2. Não use `prisma db push` no Supabase compartilhado.
3. Não insira segredos no chat, Git, documentação ou logs.
4. Para testar uma ação externa, crie um request explícito, revise o handoff, aprove manualmente e faça read-back do efeito.
5. Para mudanças de arquitetura, atualize este resumo somente com evidência nova e mantenha a separação entre request, tentativa, evento e AgentState.
