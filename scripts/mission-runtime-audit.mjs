#!/usr/bin/env node
import pg from "pg";
import { databaseSslConfig, isLocalDatabaseUrl, normalizeDatabaseUrl } from "../hermes-bridge/connection.mjs";

const { Pool } = pg;
const profiles = ["glowryia", "max", "nova", "atlas", "lia", "iris", "lex", "pulse"];
const requiredTables = [
  "requests",
  "events",
  "data_store",
  "missions",
  "hermes_tasks",
  "memory_entries",
  "AgentState",
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(2);
}

const isLocal = isLocalDatabaseUrl(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: isLocal ? process.env.DATABASE_URL : normalizeDatabaseUrl(process.env.DATABASE_URL),
  ssl: databaseSslConfig(process.env.DATABASE_URL),
});

const failures = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push({ name, detail });
  return { name, ok, detail };
};

try {
  const tableRows = await pool.query(
    `SELECT relname, relrowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='agent_mission' AND relname = ANY($1::text[])`,
    [requiredTables],
  );
  const tables = new Map(tableRows.rows.map((row) => [row.relname, row]));
  for (const table of requiredTables) {
    const row = tables.get(table);
    check(`table:${table}`, Boolean(row), row ? `rls=${row.relrowsecurity}` : "missing");
    if (row) check(`rls:${table}`, row.relrowsecurity === true, String(row.relrowsecurity));
  }

  const { rows: stats } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status='queued')::int AS queued,
            COUNT(*) FILTER (WHERE status='awaiting_approval')::int AS awaiting,
            COUNT(*) FILTER (WHERE status='approved')::int AS approved,
            COUNT(*) FILTER (WHERE status='running')::int AS running,
            COUNT(*) FILTER (WHERE status='done')::int AS done,
            COUNT(*) FILTER (WHERE status='failed')::int AS failed
       FROM agent_mission.requests`,
  );
  const requestStats = stats[0];

  const { rows: invalidProfileRows } = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM agent_mission.requests
      WHERE target_profile <> ALL($1::text[])`,
    [profiles],
  );
  check("contract:request-profiles", invalidProfileRows[0].count === 0, `${invalidProfileRows[0].count} invalid profile(s)`);
  const { rows: invalidExecutionRows } = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM agent_mission.requests
      WHERE status='queued'
         OR (status IN ('approved','running') AND NOT (
               (side_effecting=true AND kind IN ('oneshot','chat','kanban','cron.create','cron.pause','cron.resume',
                                                  'cron.run','cron.remove','cron.edit','memory.write'))
               OR (side_effecting=false AND kind='briefing.generate')
             ))`,
  );
  check("contract:execution-barrier", invalidExecutionRows[0].count === 0, `${invalidExecutionRows[0].count} invalid executable request(s)`);

  const { rows: lifecycleGaps } = await pool.query(
    `SELECT r.id, r.status, r.target_profile
       FROM agent_mission.requests r
      WHERE (r.status IN ('running','done','failed'))
        AND r.target_profile = ANY($1::text[])
        AND NOT EXISTS (
          SELECT 1 FROM agent_mission.events e
           WHERE e.request_id=r.id AND e.kind='run'
             AND (e.title LIKE 'Started:%' OR e.title LIKE 'Rejected:%')
        )
      ORDER BY r.created_at DESC`,
    [profiles],
  );
  check("request:lifecycle-start-event", lifecycleGaps.length === 0, `${lifecycleGaps.length} gap(s)`);

  const { rows: terminalGaps } = await pool.query(
    `SELECT r.id, r.status, r.target_profile
       FROM agent_mission.requests r
      WHERE r.status IN ('done','failed')
        AND r.target_profile = ANY($1::text[])
        AND NOT EXISTS (
          SELECT 1 FROM agent_mission.events e
           WHERE e.request_id=r.id AND e.kind='run'
             AND (
               (r.status='done' AND e.title LIKE 'Done:%')
               OR (r.status='failed' AND (e.title LIKE 'Failed:%' OR e.title LIKE 'Rejected:%'))
             )
        )
      ORDER BY r.created_at DESC`,
    [profiles],
  );
  check("request:lifecycle-terminal-event", terminalGaps.length === 0, `${terminalGaps.length} gap(s)`);
  const { rows: contradictoryEvents } = await pool.query(
    `WITH latest_terminal AS (
       SELECT DISTINCT ON (request_id) request_id, title
         FROM agent_mission.events
        WHERE kind='run' AND (title LIKE 'Done:%' OR title LIKE 'Failed:%' OR title LIKE 'Rejected:%')
        ORDER BY request_id, created_at DESC
     )
     SELECT r.id, r.status, r.target_profile
       FROM agent_mission.requests r
       JOIN latest_terminal e ON e.request_id=r.id
      WHERE (r.status='done' AND (e.title LIKE 'Failed:%' OR e.title LIKE 'Rejected:%'))
         OR (r.status='failed' AND e.title LIKE 'Done:%')`,
  );
  check("request:lifecycle-no-contradictory-events", contradictoryEvents.length === 0, `${contradictoryEvents.length} contradiction(s)`);

  const { rows: decisionGaps } = await pool.query(
    `SELECT r.id, r.status
       FROM agent_mission.requests r
      WHERE r.status IN ('approved','rejected')
        AND (r.decided_by IS NULL OR NOT EXISTS (
          SELECT 1 FROM agent_mission.events e
           WHERE e.request_id=r.id AND e.kind='status'
             AND (e.title LIKE 'Approved:%' OR e.title LIKE 'Rejected:%')
        ))`,
  );
  check("request:decision-audit", decisionGaps.length === 0, `${decisionGaps.length} gap(s)`);

  const { rows: latestRequests } = await pool.query(
    `SELECT DISTINCT ON (target_profile)
            target_profile, status, title, started_at, finished_at, created_at
       FROM agent_mission.requests
      WHERE target_profile = ANY($1::text[])
      ORDER BY target_profile, (status='running') DESC, started_at DESC NULLS LAST, created_at DESC`,
    [profiles],
  );
  const latestByProfile = new Map(latestRequests.map((row) => [row.target_profile, row]));
  const { rows: agentStates } = await pool.query(
    `SELECT id, status, "currentTask", "tasksCompleted"
       FROM agent_mission."AgentState"
      WHERE id = ANY($1::text[])`,
    [profiles],
  );
  const states = new Map(agentStates.map((row) => [row.id, row]));
  for (const profile of profiles) {
    const latest = latestByProfile.get(profile);
    const state = states.get(profile);
    const expectedStatus = !latest || latest.status !== "failed" && latest.status !== "running"
      ? "idle"
      : latest.status === "running" ? "working" : "error";
    check(
      `agent:${profile}:state`,
      Boolean(state),
      state ? "present" : "missing state row",
    );
    check(
      `agent:${profile}:status`,
      Boolean(state) && state.status === expectedStatus,
      state ? `${state.status} (expected ${expectedStatus})` : "missing state",
    );
    if (state && expectedStatus === "working") {
      check(
        `agent:${profile}:current-task`,
        state.currentTask === String(latest.title).slice(0, 300),
        `${state.currentTask || "null"} (expected ${String(latest.title).slice(0, 300)})`,
      );
    }
    const { rows: counts } = await pool.query(
      `SELECT COUNT(*)::int AS done_count
         FROM agent_mission.requests
        WHERE target_profile=$1 AND status='done'`,
      [profile],
    );
    check(
      `agent:${profile}:completed-count`,
      Boolean(state) && state.tasksCompleted === counts[0].done_count,
      state ? `${state.tasksCompleted} (expected ${counts[0].done_count})` : "missing state",
    );
  }

  const { rows: stores } = await pool.query(
    `SELECT key FROM agent_mission.data_store WHERE key = ANY($1::text[])`,
    [["hermes-health", "hermes-crons"]],
  );
  const storeKeys = new Set(stores.map((row) => row.key));
  check("mirror:hermes-health", storeKeys.has("hermes-health"), "data_store");
  check("mirror:hermes-crons", storeKeys.has("hermes-crons"), "data_store");

  const { rows: requestColumns } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='agent_mission' AND table_name='requests'
        AND column_name = ANY($1::text[])`,
    [["target_profile", "handoff", "side_effecting", "status", "started_at", "finished_at", "decided_by", "idempotency_scope_key", "idempotency_payload_hash"]],
  );
  check("contract:requests-columns", requestColumns.length === 9, `${requestColumns.length}/9`);
  const { rows: idempotencyIndexes } = await pool.query(
    `SELECT indexdef FROM pg_indexes
      WHERE schemaname='agent_mission' AND tablename='requests'
        AND indexname='idx_agent_mission_requests_idempotency_scope'`,
  );
  check("contract:idempotency-index", idempotencyIndexes.length === 1 && /unique index/i.test(idempotencyIndexes[0].indexdef), "partial unique scope index");

  const result = {
    ok: failures.length === 0,
    requests: requestStats,
    latestProfiles: latestRequests,
    failures,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = failures.length === 0 ? 0 : 1;
} finally {
  await pool.end();
}
