# Hermes Bridge

Two-way sync between **Hermy HQ** (the deployed website) and **Hermes** (your local agent on the Mac mini), using the `agent_mission` schema in the shared Supabase/Postgres project as a message bus. Nothing is exposed to the internet — the bridge only needs outbound access to Postgres and the local `hermes` CLI.

```
website  ──insert requests──────▶  agent_mission  ◀──poll & run──  bridge ──▶ hermes CLI
website  ◀──read projections────  schema         ◀──mirror───────  bridge ◀── hermes CLI
             AgentEvent/DataStore
```

## What it does
- **Pull (Hermes → website):** mirrors the kanban board into `HermesTask`, cron list + health into `DataStore`, projects Profile execution into `AgentState` (`working`/`idle`/`error`, current task, activity and completed count), and writes activity to `AgentEvent`.
- **Push (website → Hermes):** runs only explicitly `approved` `AgentRequest` rows via the selected persistent Hermes Profile, creates an `execution_attempts` lease, then writes request, attempt, and lifecycle event outcomes atomically. The legacy `queued` status is not executable and is removed by migration/constraint.
- Each request carries `target_profile` and a structured `handoff` JSON object. The bridge validates the Profile against the local fleet (`glowryia`, `max`, `nova`, `atlas`, `lia`, `iris`, `lex`, `pulse`) before invoking `hermes -p <profile> -t <allowlisted-tools> -z ...`. Orchestration capabilities and NotebookLM are restricted to `glowryia`.

## Setup (on the Mac mini)
1. Copy this folder to the mini (or `git pull` the repo there).
2. Install the one dependency:
   ```sh
   cd hermes-bridge && npm install
   ```
3. Make sure `hermes` is on PATH: `which hermes` should resolve (e.g. `~/.local/bin/hermes`). If NotebookLM is enabled, configure the `glowryia` Profile with the read-only-safe execution facade from the repository README; the Bridge must use `notebooklm-safe`, not the full `notebooklm` server, for requests.
4. Try it once, pointing at your DB:
   ```sh
   DATABASE_URL='postgres://…' HERMES_BOARD=default node bridge.mjs
   ```
   You should see `hermes-bridge up …`, and a "Bridge connected" event appear in the website's activity feed.
5. Run it forever with launchd:
   ```sh
   # edit the placeholders in ai.hermyhq.bridge.plist first (path, DATABASE_URL, PATH)
   cp ai.hermyhq.bridge.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/ai.hermyhq.bridge.plist
   ```
   Logs: `/tmp/hermes-bridge.out.log`, `/tmp/hermes-bridge.err.log`.

## Config (env)
| var | default | meaning |
|---|---|---|
| `DATABASE_URL` | — (required) | direct Postgres URL for the same Supabase project; never a Prisma Accelerate URL. The bridge removes `sslmode` from hosted URLs and applies its explicit TLS policy, so the Supabase URI may safely include `sslmode=require` |
| `HERMES_BOARD` | `default` | kanban board slug to mirror |
| `HERMES_BIN` | `hermes` | path to the CLI if not on PATH |
| `BRIDGE_POLL_MS` | `5000` | how often to check for new requests |
| `BRIDGE_MIRROR_MS` | `30000` | how often to mirror kanban/cron/health |
| `BRIDGE_RUN_TIMEOUT_MS` | `240000` | max time for one agent run |

## Notes / assumptions
- CLI arg shapes (`hermes kanban create <title>`, `hermes cron create <schedule> <prompt>`) are best-effort for Hermes v0.17.x — if your build differs, tweak `runRequest()` in `bridge.mjs`.
- The bridge writes to `agent_mission.*` with plain SQL, so it doesn't need Prisma. Never run `prisma db push` against the shared project.
- Safe by design: side-effecting work waits for your approval in the website's Approval Inbox before the bridge will touch it.
