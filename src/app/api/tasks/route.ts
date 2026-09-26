import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TASK_STATUSES = new Set(["Not started", "Approved", "In progress", "Done"]);

function normalizeStatus(status: string | null | undefined): string {
  switch (status) {
    case "active":
      return "In progress";
    case "completed":
      return "Done";
    case "pending":
      return "Not started";
    default:
      return TASK_STATUSES.has(status ?? "") ? status! : "Not started";
  }
}

function normalizePriority(priority: string | null | undefined): string {
  const value = priority?.toLowerCase();
  if (value === "high") return "High";
  if (value === "low") return "Low";
  return "Medium";
}

function toTask(mission: {
  id: string;
  title: string;
  status: string;
  priority: string;
  description: string;
  createdAt: Date;
}) {
  return {
    id: mission.id,
    name: mission.title,
    status: normalizeStatus(mission.status),
    priority: normalizePriority(mission.priority),
    category: "Mission",
    description: mission.description,
    dueDate: null,
    createdAt: mission.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    const missions = await prisma.mission.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tasks: missions.map(toTask) });
  } catch (error) {
    console.error("Tasks API error:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Task name is required" }, { status: 400 });
    }

    const status = TASK_STATUSES.has(body.status) ? body.status : "Not started";
    const priority = normalizePriority(body.priority);
    const mission = await prisma.mission.create({
      data: {
        agentId: "human",
        title: name,
        description: name,
        status,
        priority,
      },
    });

    return NextResponse.json({ success: true, task: toTask(mission) }, { status: 201 });
  } catch (error) {
    console.error("Create task error:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    const status = typeof body.status === "string" ? body.status : "";

    if (!id || !TASK_STATUSES.has(status)) {
      return NextResponse.json({ error: "Valid task id and status are required" }, { status: 400 });
    }

    const mission = await prisma.mission.update({
      where: { id },
      data: {
        status,
        completedAt: status === "Done" ? new Date() : null,
      },
    });

    return NextResponse.json({ success: true, task: toTask(mission) });
  } catch (error) {
    console.error("Update task error:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}
