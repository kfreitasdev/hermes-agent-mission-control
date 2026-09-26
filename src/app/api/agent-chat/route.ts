import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isMissionProfile, normalizeHandoff, type MissionProfile } from "@/lib/mission-profiles";

interface AgentChatRequest {
  agentId: string;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface AgentChatResponse {
  reply: string;
  agentId: string;
  requestId?: string;
  status?: string;
}

const CHAT_WAIT_MS = Number(process.env.HERMES_CHAT_WAIT_MS || 25000);
const CHAT_POLL_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const row = await prisma.agentRequest.create({
      data: {
        origin: "web",
        kind: "chat",
        title: `Chat · ${targetProfile}: ${message.trim()}`.slice(0, 200),
        prompt: message.trim().slice(0, 8000),
        targetProfile,
        handoff: normalizeHandoff({ context: { history: safeHistory } }) as Prisma.InputJsonObject,
        sideEffecting: false,
        status: "queued",
      },
    });

    const deadline = Date.now() + CHAT_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(CHAT_POLL_MS);
      const current = await prisma.agentRequest.findUnique({ where: { id: row.id } });
      if (current?.status === "done") {
        return NextResponse.json({
          reply: current.result || "O Profile concluiu sem retornar conteúdo.",
          agentId: targetProfile,
          requestId: row.id,
          status: current.status,
        });
      }
      if (current?.status === "failed") {
        return NextResponse.json({
          reply: `O Profile não conseguiu concluir: ${current.error || "erro não informado"}`,
          agentId: targetProfile,
          requestId: row.id,
          status: current.status,
        });
      }
    }

    return NextResponse.json({
      reply: `Solicitação enviada ao Profile ${targetProfile}. O bridge ainda está processando; acompanhe o request ${row.id} no Mission Control.`,
      agentId: targetProfile,
      requestId: row.id,
      status: "queued",
    });
  } catch (error) {
    console.error("Agent chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
