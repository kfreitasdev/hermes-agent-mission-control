export function normalizeDatabaseUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  parsed.searchParams.delete("sslmode");
  return parsed.toString();
}
