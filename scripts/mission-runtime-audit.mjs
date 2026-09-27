#!/usr/bin/env node
import pg from "pg";
import { normalizeDatabaseUrl } from "../hermes-bridge/connection.mjs";

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

const isLocal = /@(localhost|127\\.0\\.1)/.test(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: isLocal ? process.env.DATABASE_URL : normalizeDatabaseUrl(process.env.DATABASE_URL),
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
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

  const { rows: lifecycleGaps } = await pool.query(
    `SELECT r.id, r.status, r.target_profile
       FROM agent_mission.requests r
      WHERE (r.status IN ('running','done','failed'))
        AND NOT EXISTS (
          SELECT 1 FROM agent_mission.events e
           WHERE e.request_id=r.id AND e.kind='run' AND e.title LIKE 'Started:%'
        )
      ORDER BY r.created_at DESC`,
  );
  check("request:lifecycle-start-event", lifecycleGaps.length === 0, `${lifecycleGaps.length} gap(s)`);

  const { rows: terminalGaps } = await pool.query(
    `SELECT r.id, r.status, r.target_profile
       FROM agent_mission.requests r
      WHERE r.status IN ('done','failed')
        AND NOT EXISTS (
          SELECT 1 FROM agent_mission.events e
           WHERE e.request_id=r.id AND e.kind='run'
             AND e.title LIKE CASE WHEN r.status='done' THEN 'Done:%' ELSE 'Failed:%' END
        )
      ORDER BY r.created_at DESC`,
  );
  check("request:lifecycle-terminal-event", terminalGaps.length === 0, `${terminalGaps.length} gap(s)`);

  const { rows: latestRequests } = await pool.query(
    `SELECT DISTINCT ON (target_profile)
            target_profile, status, title, started_at, finished_at
       FROM agent_mission.requests
      WHERE target_profile = ANY($1::text[])
      ORDER BY target_profile, created_at DESC`,
    [profiles],
  );
  const { rows: agentStates } = await pool.query(
    `SELECT id, status, "currentTask", "tasksCompleted"
       FROM agent_mission."AgentState"
      WHERE id = ANY($1::text[])`,
    [profiles],
  );
  const states = new Map(agentStates.map((row) => [row.id, row]));
  for (const latest of latestRequests) {
    const state = states.get(latest.target_profile);
    const expectedStatus = latest.status === "running"
      ? "working"
      : latest.status === "failed"
        ? "error"
        : "idle";
    check(
      `agent:${latest.target_profile}:status`,
      Boolean(state) && state.status === expectedStatus,
      state ? `${state.status} (expected ${expectedStatus})` : "missing state",
    );
    if (state && latest.status !== "running") {
      const { rows: counts } = await pool.query(
        `SELECT COUNT(*)::int AS done_count
           FROM agent_mission.requests
          WHERE target_profile=$1 AND status='done'`,
        [latest.target_profile],
      );
      check(
        `agent:${latest.target_profile}:completed-count`,
        state.tasksCompleted === counts[0].done_count,
        `${state.tasksCompleted} (expected ${counts[0].done_count})`,
      );
    }
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
    [["target_profile", "handoff", "side_effecting", "status", "started_at", "finished_at"]],
  );
  check("contract:requests-columns", requestColumns.length === 6, `${requestColumns.length}/6`);

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
