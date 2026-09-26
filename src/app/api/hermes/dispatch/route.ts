import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isMissionProfile,
  normalizeHandoff,
  type MissionProfile,
} from "@/lib/mission-profiles";

// POST { kind?, title, prompt?, targetProfile?, handoff?, sideEffecting? }
// → queue work for a persistent Hermes Profile.
// Side-effecting work waits for approval; safe work is queued immediately.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const title = (b.title || b.prompt || "").toString().trim();
  if (!title) return NextResponse.json({ error: "title or prompt required" }, { status: 400 });

  const requestedProfile = b.targetProfile ?? b.target_profile ?? "glowryia";
  if (!isMissionProfile(requestedProfile)) {
    return NextResponse.json(
      { error: `unknown targetProfile: ${String(requestedProfile)}` },
      { status: 400 },
    );
  }
  const targetProfile: MissionProfile = requestedProfile;
  const sideEffecting = Boolean(b.sideEffecting);
  const handoff = normalizeHandoff(b.handoff);
  const row = await prisma.agentRequest.create({
    data: {
      origin: "web",
      kind: (b.kind || "oneshot").toString(),
      title: title.slice(0, 200),
      prompt: (b.prompt ?? b.title ?? "").toString() || null,
      targetProfile,
      handoff: handoff as Prisma.InputJsonObject,
      sideEffecting,
      status: sideEffecting ? "awaiting_approval" : "queued",
    },
  });
  return NextResponse.json({ request: row });
}
