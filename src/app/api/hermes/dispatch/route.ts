import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  idempotencyFields,
  isPrismaUniqueViolation,
  isValidIdempotencyKey,
  requestActor,
} from "@/lib/agent-request-errors";
import {
  isMissionProfile,
  normalizeHandoff,
  type MissionProfile,
} from "@/lib/mission-profiles";

// POST { kind?, title, prompt?, targetProfile?, handoff?, sideEffecting? }
// → queue work for a persistent Hermes Profile. Every request waits for explicit approval.
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
  const kind = (b.kind || "oneshot").toString();
  const allowedKinds = new Set([
    "oneshot", "kanban", "chat", "cron.create", "cron.pause", "cron.resume",
    "cron.run", "cron.remove", "cron.edit", "memory.write", "briefing.generate",
  ]);
  if (!allowedKinds.has(kind)) return NextResponse.json({ error: `unknown request kind: ${kind}` }, { status: 400 });
  if (!["oneshot", "chat"].includes(kind) && requestedProfile !== "glowryia") {
    return NextResponse.json({ error: `${kind} must target the Glowryia orchestrator` }, { status: 400 });
  }
  const targetProfile: MissionProfile = requestedProfile;
  // The caller cannot downgrade an arbitrary Profile prompt or Hermes
  // mutation into an auto-executable request. Every request needs approval;
  // capabilities are an explicit, server-allowlisted metadata field.
  const sideEffecting = kind !== "briefing.generate";
  const handoff = normalizeHandoff(b.handoff);
  const requestedToolsets = b.allowedToolsets ?? (b.metadata && typeof b.metadata === "object" ? b.metadata.allowedToolsets : undefined);
  const allowedToolsets = new Set(["context_engine", "web", "browser", "terminal", "file", "code_execution", "skills", "memory", "kanban", "cronjob", "notebooklm-safe"]);
  if (requestedToolsets !== undefined && (!Array.isArray(requestedToolsets)
      || requestedToolsets.some((item: unknown) => typeof item !== "string" || !allowedToolsets.has(item)))) {
    return NextResponse.json({ error: "unsupported toolset capability" }, { status: 400 });
  }
  const orchestrationToolsets = new Set(["kanban", "cronjob", "memory"]);
  if (requestedProfile !== "glowryia" && Array.isArray(requestedToolsets)
      && requestedToolsets.some((item: string) => orchestrationToolsets.has(item) || item === "notebooklm-safe")) {
    return NextResponse.json({ error: "orchestration toolsets must target glowryia" }, { status: 400 });
  }
  if (kind === "briefing.generate" && Array.isArray(requestedToolsets)
      && requestedToolsets.some((item: string) => item !== "context_engine")) {
    return NextResponse.json({ error: "briefing requests accept only the read-only context_engine toolset" }, { status: 400 });
  }
  const promptText = String(b.prompt ?? b.title ?? "");
  const metadataInput = b.metadata && typeof b.metadata === "object" && !Array.isArray(b.metadata) ? b.metadata : {};
  const safeNotebookRequested = Array.isArray(requestedToolsets) && requestedToolsets.includes("notebooklm-safe");
  const inferredNotebookOperation = typeof metadataInput.notebookOperation === "string" && ["create_notebook", "add_source", "list_notebooks", "list_sources"].includes(metadataInput.notebookOperation)
    ? metadataInput.notebookOperation
    : /\bnlm_create_notebook\b|\bcreate(?: a| an)? notebook(?:lm)?\b|\bcriar(?: um)? notebook(?:lm)?\b/i.test(promptText) ? "create_notebook"
    : /\bnlm_add_source\b|\badd(?: a| an)? source\b|\badicionar fonte\b/i.test(promptText) ? "add_source"
    : /\bnlm_list_sources\b|\blist(?: the)? sources\b|\blistar fontes\b/i.test(promptText) ? "list_sources"
    : /\bnlm_list_notebooks\b|\blist(?: the)? notebooks\b|\blistar notebooks\b/i.test(promptText) ? "list_notebooks" : null;
  if (requestedProfile !== "glowryia" && (safeNotebookRequested || /\bnotebooklm\b|\bnlm_(?:create_notebook|add_source)\b/i.test(promptText))) {
    return NextResponse.json({ error: "NotebookLM requests must target glowryia" }, { status: 400 });
  }
  if ((safeNotebookRequested || /\bnotebooklm\b|\bnlm_(?:create_notebook|add_source)\b/i.test(promptText)) && !inferredNotebookOperation) {
    return NextResponse.json({ error: "NotebookLM requests must declare one safe operation" }, { status: 400 });
  }
  const metadata = {
    ...metadataInput,
    ...(requestedToolsets ? { allowedToolsets: requestedToolsets } : {}),
    ...(inferredNotebookOperation ? { notebookOperation: inferredNotebookOperation } : {}),
  };
  const actor = await requestActor();
  const suppliedIdempotencyKey = b.idempotencyKey ?? req.headers.get("Idempotency-Key");
  if (!isValidIdempotencyKey(suppliedIdempotencyKey)) {
    return NextResponse.json({ error: "Idempotency-Key must be 1-200 characters" }, { status: 400 });
  }
  const idempotency = idempotencyFields("dispatch", suppliedIdempotencyKey, actor, b);
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
        kind,
        title: title.slice(0, 200),
        prompt: (b.prompt ?? b.title ?? "").toString() || null,
        targetProfile,
        handoff: handoff as Prisma.InputJsonObject,
        metadata: metadata as Prisma.InputJsonObject,
        sideEffecting,
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
