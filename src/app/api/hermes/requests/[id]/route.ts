import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requestActor } from "@/lib/agent-request-errors";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await prisma.agentRequest.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ request: row });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const action = (b.action || "").toString(); // approve | reject | edit
  const existing = await prisma.agentRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (existing.status !== "awaiting_approval")
    return NextResponse.json({ error: `cannot decide a ${existing.status} request` }, { status: 409 });

  const actor = await requestActor();
  const data: Record<string, unknown> = { decidedAt: new Date(), decidedBy: actor };
  let decisionTitle = "Approved";
  if (action === "approve") data.status = "approved";
  else if (action === "reject") { data.status = "rejected"; decisionTitle = "Rejected"; }
  else if (action === "edit") {
    data.status = "approved";
    if (b.prompt) data.prompt = b.prompt.toString();
    if (b.title) data.title = b.title.toString().slice(0, 200);
    decisionTitle = "Approved (edited)";
  }
  else return NextResponse.json({ error: "action must be approve|reject|edit" }, { status: 400 });

  // Update and audit event are one transaction: an external effect cannot be
  // approved without a durable actor and decision event.
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.agentRequest.updateMany({
      where: { id, status: "awaiting_approval" },
      data,
    });
    if (changed.count !== 1) return changed;
    await tx.agentEvent.create({
      data: {
        requestId: id,
        kind: "status",
        title: `${decisionTitle}: ${existing.title}`.slice(0, 200),
        detail: `Decision by ${actor}`,
        agent: existing.targetProfile,
        level: action === "reject" ? "down" : "info",
        meta: { requestId: id, action, decidedBy: actor },
      },
    });
    return changed;
  });
  if (updated.count !== 1) {
    const current = await prisma.agentRequest.findUnique({ where: { id } });
    return NextResponse.json(
      { error: `request changed concurrently${current ? `: ${current.status}` : ""}` },
      { status: 409 },
    );
  }
  const row = await prisma.agentRequest.findUnique({ where: { id } });
  return NextResponse.json({ request: row });
}
