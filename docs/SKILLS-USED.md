# Skills utilizadas na manutenção

Este arquivo registra as skills Hermes carregadas ou aplicadas durante a manutenção do Glowryia Agents. As skills globais continuam sendo instaladas no ambiente Hermes do operador; este repositório também contém uma skill operacional própria em `skills/agent-mission-audit/SKILL.md` para permitir que outro agente reproduza o fluxo sem depender de memória da sessão.

## Skills globais aplicadas

- **`agentes-engenharia`** — arquitetura, backend, frontend, integração de Profiles e revisão de código.
- **`systematic-debugging`** — investigação por evidência, causa-raiz, loops de reprodução e correções incrementais.
- **`platform-implementation-operations`** — separação API/navegador/manual, deployment, Supabase, systemd, HTTPS, Bridge e gates de execução.
- **`hermes-agent`** — configuração e operação do Hermes CLI, Profiles, MCP e runtime local.
- **`supabase-control-plane-operations`** — operação do projeto Supabase, schema `agent_mission`, migrations versionadas e RLS.
- **`notebooklm-research`** — integração e validação read-only do NotebookLM com citações/read-back, sem substituir a autenticação existente.
- **`requesting-code-review`** — preparação de gates de revisão, diff, testes e critérios de aceite.
- **`hermes-agent-skill-authoring`** — formato e boas práticas para a skill versionada neste repositório.

## Skill versionada neste repositório

- [`skills/agent-mission-audit/SKILL.md`](../skills/agent-mission-audit/SKILL.md) — procedimento reproduzível para auditar o Agent Mission, o Bridge, os oito Profiles, aprovações, toolsets, lifecycle, NotebookLM, banco e deployment sem executar efeitos externos por padrão.

## Regra de proveniência

A documentação acima registra nomes e finalidade, não copia credenciais, cookies, tokens, connection strings ou sessões. Valores secretos continuam somente no cofre/`.env` local protegido.
