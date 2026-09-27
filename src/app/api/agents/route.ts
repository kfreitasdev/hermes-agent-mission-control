import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Persistent Hermes Profile roster. The bridge uses the same ids when routing
// Agent Mission requests, so the dashboard never advertises a persona that
// cannot execute on the Hermes host.
const DEFAULT_AGENTS = [
  {
    id: "glowryia",
    name: "Glowryia",
    emoji: "✦",
    role: "Orquestradora · Plataforma Glowryia",
    status: "online",
    tasksCompleted: 0,
    totalCost: 0,
    recentActivity: [],
  },
  {
    id: "max",
    name: "Max",
    emoji: "🐺",
    role: "Assessor executivo",
    status: "idle",
    tasksCompleted: 0,
    totalCost: 0,
    recentActivity: [],
  },
  {
    id: "lia",
    name: "Lia",
    emoji: "⌘",
    role: "Requisitos · Processos",
    status: "idle",
    tasksCompleted: 0,
    totalCost: 0,
    recentActivity: [],
  },
  {
    id: "nova",
    name: "Nova",
    emoji: "★",
    role: "YouTube · Vídeo",
    status: "idle",
    tasksCompleted: 0,
    totalCost: 0,
    recentActivity: [],
  },
  {
    id: "atlas",
    name: "Atlas",
    emoji: "◈",
    role: "Tráfego pago · Growth",
    status: "idle",
    tasksCompleted: 0,
    totalCost: 0,
    recentActivity: [],
  },
  {
    id: "pulse",
    name: "Pulse",
    emoji: "⌁",
    role: "Mensuração · Atribuição",
    status: "idle",
    tasksCompleted: 0,
    totalCost: 0,
    recentActivity: [],
  },
  {
    id: "iris",
    name: "Íris",
    emoji: "◇",
    role: "Propostas comerciais",
    status: "idle",
    tasksCompleted: 0,
    totalCost: 0,
    recentActivity: [],
  },
  {
    id: "lex",
    name: "Lex",
    emoji: "§",
    role: "Contratos · Conferência",
    status: "idle",
    tasksCompleted: 0,
    totalCost: 0,
    recentActivity: [],
  },
];

export async function GET() {
  try {
    const states = await prisma.agentState.findMany();
    const stateMap: Record<string, any> = {};
    for (const s of states) {
      stateMap[s.id] = s;
    }

    const agents = DEFAULT_AGENTS.map((agent) => {
      const s = stateMap[agent.id] || {};
      return {
        ...agent,
        status: s.id ? (s.status || "offline") : "offline",
        currentTask: s.currentTask || undefined,
        lastActive: s.lastActive || undefined,
        tasksCompleted: s.tasksCompleted || agent.tasksCompleted,
        totalCost: s.totalCost || agent.totalCost,
        recentActivity: s.recentActivity || agent.recentActivity,
      };
    });

    return NextResponse.json(agents, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Agents API error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Agent state unavailable" }, { status: 503 });
  }
}
