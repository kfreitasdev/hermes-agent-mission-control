export function normalizeDatabaseUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  parsed.searchParams.delete("sslmode");
  return parsed.toString();
}

export function attachPoolErrorLogger(pool, logger = console.error) {
  pool.on("error", (error) => {
    logger(error instanceof Error ? error.message : String(error));
  });
  return pool;
}
