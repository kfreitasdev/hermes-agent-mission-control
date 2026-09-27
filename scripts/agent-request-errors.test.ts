import test from "node:test";
import assert from "node:assert/strict";
import { idempotencyFields, isValidIdempotencyKey } from "../src/lib/agent-request-errors";

test("idempotency identity is stable across body/header key placement", () => {
  const fromBody = idempotencyFields("dispatch", "same-key", "operator@example.com", {
    idempotencyKey: "same-key",
    title: "same payload",
  });
  const fromHeader = idempotencyFields("dispatch", "same-key", "operator@example.com", {
    title: "same payload",
  });
  const reordered = idempotencyFields("dispatch", "same-key", "operator@example.com", {
    nested: { b: 2, a: 1 },
    title: "same payload",
    list: [{ z: 3, a: 1 }],
  });
  const reorderedAgain = idempotencyFields("dispatch", "same-key", "operator@example.com", {
    list: [{ a: 1, z: 3 }],
    title: "same payload",
    nested: { a: 1, b: 2 },
  });
  assert.equal(fromBody.idempotencyScopeKey, fromHeader.idempotencyScopeKey);
  assert.equal(fromBody.idempotencyPayloadHash, fromHeader.idempotencyPayloadHash);
  assert.equal(fromBody.idempotencyKey, fromHeader.idempotencyKey);
  assert.equal(reordered.idempotencyPayloadHash, reorderedAgain.idempotencyPayloadHash);
});

test("idempotency keys have a bounded index-safe length", () => {
  assert.equal(isValidIdempotencyKey(undefined), true);
  assert.equal(isValidIdempotencyKey("a".repeat(200)), true);
  assert.equal(isValidIdempotencyKey("a".repeat(201)), false);
  assert.equal(isValidIdempotencyKey(""), false);
});
test("idempotency identity preserves actor, scope, and payload boundaries", () => {
  const base = idempotencyFields("dispatch", "same-key", "operator@example.com", { title: "one" });
  const changedPayload = idempotencyFields("dispatch", "same-key", "operator@example.com", { title: "two" });
  const changedActor = idempotencyFields("dispatch", "same-key", "other@example.com", { title: "one" });
  assert.notEqual(base.idempotencyPayloadHash, changedPayload.idempotencyPayloadHash);
  assert.notEqual(base.idempotencyScopeKey, changedActor.idempotencyScopeKey);
  assert.notEqual(base.idempotencyKey, changedPayload.idempotencyKey);
});
