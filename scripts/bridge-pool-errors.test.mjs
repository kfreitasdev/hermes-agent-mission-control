import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachPoolErrorLogger } from "../hermes-bridge/connection.mjs";

test("bridge pool errors are observed instead of becoming unhandled process errors", () => {
  const pool = new EventEmitter();
  const messages = [];
  attachPoolErrorLogger(pool, (message) => messages.push(message));
  pool.emit("error", new Error("connection reset"));
  assert.deepEqual(messages, ["connection reset"]);
});
