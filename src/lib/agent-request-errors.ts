import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requestActor(): Promise<string> {
  const session = await getServerSession(authOptions);
  return session?.user?.email || session?.user?.id || "anonymous";
}

function stablePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stablePayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== "idempotencyKey")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stablePayload(item)]));
  }
  return value;
}

export function idempotencyPayloadHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stablePayload(payload) ?? null))
    .digest("hex")
    .slice(0, 32);
}

export function scopedIdempotencyScopeKey(scope: string, value: unknown, actor: string): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const actorHash = createHash("sha256").update(actor).digest("hex").slice(0, 32);
  return `${scope}:${actorHash}:${raw}`;
}

export function scopedIdempotencyKey(
  scope: string,
  value: unknown,
  actor: string,
  payload: unknown,
): string | null {
  const prefix = scopedIdempotencyScopeKey(scope, value, actor);
  return prefix ? `${prefix}:${idempotencyPayloadHash(payload)}` : null;
}

export function isValidIdempotencyKey(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200);
}

export function idempotencyFields(
  scope: string,
  value: unknown,
  actor: string,
  payload: unknown,
) {
  const idempotencyScopeKey = scopedIdempotencyScopeKey(scope, value, actor);
  const payloadHash = idempotencyPayloadHash(payload);
  return {
    idempotencyKey: idempotencyScopeKey ? `${idempotencyScopeKey}:${payloadHash}` : null,
    idempotencyScopeKey,
    idempotencyPayloadHash: idempotencyScopeKey ? payloadHash : null,
  };
}

export function isPrismaUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
