import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const migrationPath = path.join(root, "../../glowryia-console/supabase/migrations/0026_agent_mission_content_projection.sql");

const idempotencyMigrationPath = path.join(root, "../../glowryia-console/supabase/migrations/0027_agent_mission_request_idempotency.sql");
const decisionMigrationPath = path.join(root, "../../glowryia-console/supabase/migrations/0028_agent_mission_request_decision_audit.sql");

const expectedTables = [
  "Draft",
  "TweetMetric",
  "Idea",
  "ContentCalendar",
  "YoutubeIdea",
  "YoutubeScript",
  "YoutubeFeedback",
  "LongformScript",
  "AgentState",
  "AgentBusMessage",
  "BattleRoyaleBot",
  "ContentRequest",
  "Article",
  "SavedTitle",
  "ClientPulseClient",
  "ClientPulseChat",
  "ClientPulseMessage",
  "ClientPulseAnalysis",
  "ClientPulseAlert",
];

test("legacy content projection migration exists in agent_mission", () => {
  assert.equal(fs.existsSync(migrationPath), true, `missing ${migrationPath}`);
  const sql = fs.readFileSync(migrationPath, "utf8");
  for (const table of expectedTables) {
    assert.match(sql, new RegExp(`create table if not exists agent_mission\\\.\\"${table}\\"`, "i"), table);
    assert.match(sql, new RegExp(`alter table agent_mission\\\.\\"${table}\\" enable row level security`, "i"), table);
  }
  assert.match(sql, /grant select, insert, update, delete on all tables in schema agent_mission to service_role/i);
});

test("request idempotency migration is versioned and atomic", () => {
  assert.equal(fs.existsSync(idempotencyMigrationPath), true, `missing ${idempotencyMigrationPath}`);
  const sql = fs.readFileSync(idempotencyMigrationPath, "utf8");
  assert.match(sql, /add column if not exists idempotency_scope_key/i);
  assert.match(sql, /add column if not exists idempotency_payload_hash/i);
  assert.match(sql, /create unique index if not exists idx_agent_mission_requests_idempotency_scope/i);
  assert.match(sql, /where idempotency_scope_key is not null/i);
});
test("request decisions carry an actor and versioned audit migration", () => {
  assert.equal(fs.existsSync(decisionMigrationPath), true, `missing ${decisionMigrationPath}`);
  const sql = fs.readFileSync(decisionMigrationPath, "utf8");
  assert.match(sql, /add column if not exists decided_by/i);
});
test("legacy Prisma models use the Agent Mission schema", () => {
  const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
  for (const model of expectedTables) {
    const block = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`, "m"))?.[1] || "";
    assert.match(block, /@@schema\("agent_mission"\)/, model);
  }
});
