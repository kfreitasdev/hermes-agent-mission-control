import test from "node:test";
import assert from "node:assert/strict";
import { buildAgentState } from "../hermes-bridge/agent-state.mjs";

test("bridge marks a profile as working with the current request", () => {
  const state = buildAgentState({
    profile: "glowryia",
    status: "working",
    currentTask: "Auditar a integração",
    action: "Iniciou: Auditar a integração",
    now: new Date("2026-09-27T18:00:00.000Z"),
  });

  assert.equal(state.status, "working");
  assert.equal(state.currentTask, "Auditar a integração");
  assert.equal(state.tasksCompleted, 0);
  assert.equal(state.recentActivity[0].action, "Iniciou: Auditar a integração");
});

test("bridge returns a profile to idle and increments completed work once", () => {
  const state = buildAgentState({
    profile: "glowryia",
    status: "idle",
    action: "Concluído: Radar diário",
    completed: true,
    existing: {
      tasksCompleted: 2,
      totalCost: 1.25,
      recentActivity: [{ action: "anterior" }],
    },
    now: new Date("2026-09-27T18:01:00.000Z"),
  });

  assert.equal(state.status, "idle");
  assert.equal(state.currentTask, null);
  assert.equal(state.tasksCompleted, 3);
  assert.equal(state.totalCost, 1.25);
  assert.equal(state.recentActivity.length, 2);
});

test("unknown profiles are rejected before persistence", () => {
  assert.throws(
    () => buildAgentState({ profile: "not-allowed", status: "working" }),
    /unknown Hermes Profile/,
  );
});
