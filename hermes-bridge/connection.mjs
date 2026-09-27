import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function normalizeDatabaseUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  for (const parameter of [
    "sslmode", "ssl", "uselibpqcompat", "sslcert", "sslkey", "sslrootcert", "sslpassword",
    "ssl_min_protocol_version", "ssl_max_protocol_version", "sslnegotiation",
  ]) parsed.searchParams.delete(parameter);
  return parsed.toString();
}

export function isLocalDatabaseUrl(rawUrl) {
  const hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function databaseSslConfig(rawUrl) {
  if (isLocalDatabaseUrl(rawUrl)) return undefined;
  const caPath = process.env.DATABASE_SSL_CA
    || process.env.PGSSLROOTCERT
    || path.join(os.homedir(), ".hermes", "certs", "supabase-root-2021-ca.pem");
  const ca = fs.existsSync(caPath) ? fs.readFileSync(caPath, "utf8") : undefined;
  return {
    // Always verify remote database certificates. Supply a CA via
    // DATABASE_SSL_CA/PGSSLROOTCERT when the provider uses a private root.
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
  };
}

export function attachPoolErrorLogger(pool, logger = console.error) {
  pool.on("error", (error) => {
    logger(error instanceof Error ? error.message : String(error));
  });
  return pool;
}
