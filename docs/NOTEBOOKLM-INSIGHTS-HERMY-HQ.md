# Insights do NotebookLM — Hermy HQ

**Empresa:** Glowryia (processo interno)  
**Projeto:** Hermy HQ / `hermes-agent-mission-control`  
**Notebook:** `Glowryia | Interno | Interface Hermes — avaliação do vídeo`  
**Notebook ID:** `bdea6055-6030-4897-9683-d8ea5fb4ebf6`  
**Consulta:** 2026-09-26 UTC

## Fontes consultadas

- [Repositório hermes-agent-mission-control](https://github.com/sharbelxyz/hermes-agent-mission-control)
- [How To Build a PREMIUM Hermes Agent Mission Control Dashboard](https://www.youtube.com/watch?v=gf9C42ybZLY)
- [7 passos obrigatórios para usar o Hermes e criar agentes que trabalham por você](https://youtu.be/mU06NTyBsS8)
- [Meu Segundo Cérebro com IA: Claude, Hermes e Agentes trabalhando juntos](https://youtu.be/1INCBRIlksc)
- [Meu setup de Hermes: Como uso meus 3 agentes de IA automatizam TUDO para mim](https://youtu.be/TSimMWwR6to)

## Fatos extraídos das fontes

- O dashboard é um cockpit para dispatch, acompanhamento, aprovação e memória; não deve expor shell ou o runtime do Hermes diretamente ao navegador.
- Website e agente se comunicam por um Postgres compartilhado usado como message bus. A bridge local consulta o banco, chama a CLI `hermes` e grava eventos/resultados.
- A bridge deve usar somente conexões de saída; o servidor que executa Hermes não precisa expor portas de entrada à internet.
- Requisições com efeitos colaterais devem permanecer em `awaiting_approval` até uma aprovação humana explícita.
- A operação precisa tornar visíveis aprovações, falhas de cron, tarefas em aberto, resultados e próxima ação — não apenas mostrar gráficos.
- A memória deve ser inspecionável e versionada: wiki/memória quente, camadas nativas do Hermes e Segundo Cérebro corporativo no GitHub têm papéis diferentes.
- Skills e cronjobs são parte da operação, mas precisam de governança, observabilidade e recuperação de falhas.

## Decisões aplicadas nesta etapa

- Removido o bypass de autenticação em desenvolvimento; a ausência de `NEXTAUTH_SECRET` agora bloqueia o acesso em vez de liberar o painel.
- Desativado o endpoint legado de senha e removido o uso da senha como valor de cookie.
- Removidos segredos hard-coded do frontend e dos endpoints de atualização de radar.
- Endpoints internos passaram a falhar fechado quando o segredo não está configurado; segredos em query string foram removidos.
- A bridge agora faz claim transacional com `FOR UPDATE SKIP LOCKED` e nunca executa uma requisição `queued` marcada como side-effecting.
- O lockfile da bridge foi versionado e `node_modules` aninhado passou a ser ignorado pelo Git.

## Lacunas para produção

- Criar/configurar `.env` apenas no ambiente de execução, com `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, OAuth Google, `ALLOWED_EMAILS` e segredos internos; nenhum desses valores existe neste repositório.
- Migration versionada do namespace `agent_mission` aplicada no Supabase existente; o runtime Prisma/bridge já está sendo adaptado para usar as tabelas isoladas.
- Instalar a bridge como serviço persistente no servidor/VPS do Hermes e validar o fluxo completo com uma requisição controlada.
- Definir autorização além da allowlist de e-mail antes de usuários adicionais: papéis, aprovação, auditoria e isolamento por empresa/projeto.
- Integrar a memória do dashboard ao Segundo Cérebro oficial sem criar uma segunda fonte de verdade.
- O domínio `console.glowryia.com` já está associado ao projeto Vercel `glowryia-console` (Vite). Um novo projeto Next.js não pode assumir o mesmo domínio sem uma decisão de arquitetura (integração no projeto existente, proxy/roteamento ou subdomínio separado).
- O lint completo do template continua falhando com problemas preexistentes; o build e o TypeScript passam, mas isso não deve ser tratado como aprovação de produção.

## Evidência local desta etapa

- `npm run build`: passou; 44 rotas geradas.
- `npx tsc --noEmit --pretty false`: passou.
- `node --check hermes-bridge/bridge.mjs`: passou.
- Smoke test sem ambiente configurado: `/` redireciona para `/login?error=configuration`, `/login` retorna 200, API protegida retorna 503 e `/api/auth/login` retorna 410.
- `npm run lint`: falhou com 124 erros e 46 avisos no template upstream; o relatório completo deve ser tratado como pendência separada.

## Aplicação dos insights no ecossistema Glowryia

A finalidade desta análise não é reproduzir o dashboard do vídeo isoladamente. O Agent Mission deve funcionar como uma camada operacional do ecossistema, com limites claros:

- **Agent Mission / Hermy HQ:** intake, dispatch, aprovação, acompanhamento, resultado e auditoria das execuções.
- **Hermes + bridge:** runtime de execução; permanece privado e acessível somente por saída para o message bus.
- **Segundo Cérebro no GitHub:** fonte institucional para contexto, decisões, procedimentos e aprendizados versionados.
- **Glowryia Console:** sistema operacional existente; sua sessão, contratos e configurações não serão duplicados silenciosamente no Mission. O projeto Supabase existente (`ltwiodjbifmpveehougo`) permanece como backend gerenciado.
- **Supabase / schema `agent_mission`:** namespace dedicado somente para filas, eventos e projeções próprias do cockpit. As entidades canônicas de operação que já existem em `public` continuam sendo a fonte do Glowryia Console; não haverá cópia paralela de `tasks`, `executions`, `results` ou `audit_events`.
- **Notion:** não será dependência do Agent Mission. O conteúdo institucional e as decisões estáveis permanecem no Segundo Cérebro; integrações editoriais, se existirem, ficam fora deste produto.
- **Discord/Telegram:** canais de entrada e notificação; não são fonte de verdade para estado operacional.

### Primeira fatia vertical do ecossistema

1. Usuário cria uma demanda no Mission com empresa/projeto e objetivo.
2. A API valida escopo e grava `AgentRequest` no Postgres.
3. Ações externas ficam em `awaiting_approval`; tarefas seguras seguem para `queued`.
4. A bridge faz claim transacional, executa o Hermes e grava evento, resultado ou erro.
5. O Mission mostra a próxima ação e permite aprovação/rejeição com trilha de auditoria.
6. Depois do read-back, um adapter explícito pode registrar o resultado no Segundo Cérebro ou outro sistema aprovado — sem criar uma segunda fonte de verdade.

### Ordem de evolução

- **P0 — Segurança e isolamento:** concluído nesta etapa no checkout local.
- **P1 — Operação publicada:** migration versionada do schema `agent_mission` aplicada; ainda faltam DNS de `hermes.glowryia.com`, reverse proxy/HTTPS ou configuração equivalente, OAuth, ambiente de produção e bridge persistente.
- **P2 — Integrações controladas:** adapters para Segundo Cérebro, Glowryia Console e notificações; cada adapter terá contrato, permissão, idempotência e read-back.
- **P3 — Governança ampliada:** RBAC, escopo empresa/projeto, auditoria completa e execução concorrente segura para mais operadores/agentes.
- **P4 — Inteligência operacional:** cron monitorado, skills versionadas, memória pesquisável, briefs e recomendações com aprovação humana para efeitos externos.

### Não objetivos desta implantação

- Não transformar o Mission em uma cópia paralela do Glowryia Console.
- Não duplicar a memória institucional em um banco sem proveniência.
- Não expor ferramentas, prompts, shell ou sessões do Hermes ao navegador.
- Não habilitar autonomia irreversível antes de aprovação, auditoria e read-back.

## Limite da análise

As afirmações sobre o código do template foram confrontadas com o checkout local. As recomendações arquiteturais acima são síntese do NotebookLM e decisão de engenharia; não significam que Supabase, RLS, RBAC, domínio, OAuth ou bridge de produção já estejam configurados.
