import assert from "node:assert/strict";
import { databaseSslConfig, isLocalDatabaseUrl, normalizeDatabaseUrl } from "../hermes-bridge/connection.mjs";

const input = "postgresql://postgres.example:secret@example.com:5432/postgres?sslmode=require&application_name=mission";
const normalized = normalizeDatabaseUrl(input);

assert.doesNotMatch(normalized, /sslmode=/);
assert.doesNotMatch(normalizeDatabaseUrl("postgresql://user:***@db.example.com/db?ssl=no-verify&uselibpqcompat=true"), /(?:ssl|uselibpqcompat)=/i);
assert.match(normalized, /application_name=mission/);
assert.match(normalized, /postgresql:\/\/postgres.example:secret@example.com/);
assert.equal(isLocalDatabaseUrl("postgresql://user:pass@127.0.0.1:5432/db"), true);
assert.equal(isLocalDatabaseUrl("postgresql://user:pass@[::1]:5432/db"), true);
assert.equal(isLocalDatabaseUrl("postgresql://user:pass@db.example.com:5432/db"), false);
const previousOverride = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = "false";
assert.equal(databaseSslConfig("postgresql://user:***@db.example.com:5432/db").rejectUnauthorized, true);
if (previousOverride === undefined) delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
else process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = previousOverride;
console.log("bridge connection normalization: ok");
