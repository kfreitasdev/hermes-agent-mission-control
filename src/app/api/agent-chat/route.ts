import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idempotencyFields, isPrismaUniqueViolation, isValidIdempotencyKey, requestActor } from "@/lib/agent-request-errors";
import { isMissionProfile, normalizeHandoff, type MissionProfile } from "@/lib/mission-profiles";

interface AgentChatRequest {
  agentId: string;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  idempotencyKey?: string;
}

interface AgentChatResponse {
  reply: string;
  agentId: string;
  requestId?: string;
  status?: string;
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AgentChatResponse | { error: string }>> {
  try {
    const body: AgentChatRequest = await request.json();
    const { agentId, message, history = [] } = body;

    if (!agentId || !message?.trim()) {
      return NextResponse.json({ error: "Missing agentId or message" }, { status: 400 });
    }
    if (!isMissionProfile(agentId)) {
      return NextResponse.json({ error: `Unknown Hermes Profile: ${agentId}` }, { status: 400 });
    }

    const targetProfile: MissionProfile = agentId;
    const safeHistory = history.slice(-10).map((item) => ({
      role: item.role,
      content: String(item.content || "").slice(0, 4000),
    }));
    const actor = await requestActor();
    const suppliedIdempotencyKey = body.idempotencyKey ?? request.headers.get("Idempotency-Key");
    if (!isValidIdempotencyKey(suppliedIdempotencyKey)) {
      return NextResponse.json({ error: "Idempotency-Key must be 1-200 characters" }, { status: 400 });
    }
    const idempotency = idempotencyFields(
      "agent-chat",
      suppliedIdempotencyKey,
      actor,
      body,
    );
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
        return NextResponse.json({
          reply: `Solicitação já registrada para o Profile ${targetProfile}; request ${existing.id}.`,
          agentId: targetProfile,
          requestId: existing.id,
          status: existing.status,
        });
      }
    }
    let row;
    try {
      row = await prisma.agentRequest.create({
        data: {
          origin: "web",
          kind: "chat",
          title: `Chat · ${targetProfile}: ${message.trim()}`.slice(0, 200),
          prompt: message.trim().slice(0, 8000),
          targetProfile,
          handoff: normalizeHandoff({ context: { history: safeHistory } }) as Prisma.InputJsonObject,
          sideEffecting: true,
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
          return NextResponse.json({
            reply: `Solicitação já registrada para o Profile ${targetProfile}; request ${existing.id}.`,
            agentId: targetProfile,
            requestId: existing.id,
            status: existing.status,
          });
        }
      }
      throw error;
    }

    return NextResponse.json({
      reply: `Solicitação enviada ao Profile ${targetProfile}. O bridge processará o request ${row.id}; esta conversa será atualizada quando o resultado estiver disponível.`,
      agentId: targetProfile,
      requestId: row.id,
      status: row.status,
    });
  } catch (error) {
    console.error("Agent chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
