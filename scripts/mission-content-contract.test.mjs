import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const migrationPath = path.join(root, "../../glowryia-console/supabase/migrations/0026_agent_mission_content_projection.sql");

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

test("legacy Prisma models use the Agent Mission schema", () => {
  const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
  for (const model of expectedTables) {
    const block = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`, "m"))?.[1] || "";
    assert.match(block, /@@schema\("agent_mission"\)/, model);
  }
});
