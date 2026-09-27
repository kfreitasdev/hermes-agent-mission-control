import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idempotencyFields, isPrismaUniqueViolation, isValidIdempotencyKey, requestActor } from "@/lib/agent-request-errors";

export async function GET() {
  const row = await prisma.dataStore.findUnique({ where: { key: "hermes-briefing" } });
  return NextResponse.json(row?.data ?? { generatedAt: null, summary: null, sections: [] });
}

// POST → ask the bridge to (re)generate the chief-of-staff brief now.
export async function POST(req: Request) {
  const actor = await requestActor();
  const suppliedIdempotencyKey = req.headers.get("Idempotency-Key");
  if (!isValidIdempotencyKey(suppliedIdempotencyKey)) {
    return NextResponse.json({ error: "Idempotency-Key must be 1-200 characters" }, { status: 400 });
  }
  const idempotency = idempotencyFields("briefing", suppliedIdempotencyKey, actor, { kind: "briefing.generate" });
  const idempotencyKey = idempotency.idempotencyKey;
  if (idempotency.idempotencyScopeKey) {
    const existing = await prisma.agentRequest.findFirst({
      where: {
        OR: [
          { idempotencyScopeKey: idempotency.idempotencyScopeKey },
          ...(idempotencyKey ? [{ idempotencyKey }] : []),
        ],
      },
    });
    if (existing) {
      const samePayload = existing.idempotencyPayloadHash === idempotency.idempotencyPayloadHash
        || existing.idempotencyKey === idempotencyKey;
      if (!samePayload) return NextResponse.json({ error: "Idempotency-Key was reused with a different payload" }, { status: 409 });
      return NextResponse.json({ request: existing, idempotent: true });
    }
  }
  let row;
  try {
    row = await prisma.agentRequest.create({
      data: {
        origin: "web",
        kind: "briefing.generate",
        title: "Generate chief-of-staff brief",
        prompt: "now",
        sideEffecting: false,
        status: "awaiting_approval",
        ...idempotency,
      },
    });
  } catch (error) {
    if (idempotency.idempotencyScopeKey && isPrismaUniqueViolation(error)) {
      const existing = await prisma.agentRequest.findFirst({ where: { idempotencyScopeKey: idempotency.idempotencyScopeKey } });
      if (existing) {
        const samePayload = existing.idempotencyPayloadHash === idempotency.idempotencyPayloadHash
          || existing.idempotencyKey === idempotencyKey;
        if (!samePayload) return NextResponse.json({ error: "Idempotency-Key was reused with a different payload" }, { status: 409 });
        return NextResponse.json({ request: existing, idempotent: true });
      }
    }
    throw error;
  }
  return NextResponse.json({ request: row });
}
