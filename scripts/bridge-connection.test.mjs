import assert from "node:assert/strict";
import { normalizeDatabaseUrl } from "../hermes-bridge/connection.mjs";

const input = "postgresql://postgres.example:secret@example.com:5432/postgres?sslmode=require&application_name=mission";
const normalized = normalizeDatabaseUrl(input);

assert.doesNotMatch(normalized, /sslmode=/);
assert.match(normalized, /application_name=mission/);
assert.match(normalized, /postgresql:\/\/postgres.example:secret@example.com/);
console.log("bridge connection normalization: ok");
