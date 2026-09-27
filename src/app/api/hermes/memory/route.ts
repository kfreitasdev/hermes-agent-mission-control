import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idempotencyFields, isPrismaUniqueViolation, isValidIdempotencyKey, requestActor } from "@/lib/agent-request-errors";

// GET ?q=&type=&status= → list/search wiki entries (mirrored by the bridge)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status") || "active";
  const where: Record<string, unknown> = {};
  if (status !== "all") where.status = status;
  if (type && type !== "all") where.type = type;
  if (q) where.OR = [
    { title: { contains: q, mode: "insensitive" } },
    { body: { contains: q, mode: "insensitive" } },
    { tags: { has: q.toLowerCase() } },
  ];
  const entries = await prisma.hermesMemory.findMany({ where, orderBy: { updatedAt: "desc" }, take: 300 });
  const all = await prisma.hermesMemory.findMany({ select: { type: true }, where: status === "all" ? {} : { status } });
  const typeCounts: Record<string, number> = {};
  for (const e of all) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  const lastSync = entries[0]?.syncedAt ?? null;
  return NextResponse.json({ entries, typeCounts, total: all.length, lastSync });
}

function normalizeWikiPath(value: unknown): string | null {
  const candidate = String(value ?? "").trim().replaceAll("\\", "/");
  if (!candidate || candidate.includes("\0") || candidate.startsWith("/")
      || candidate.split("/").includes("..") || !candidate.toLowerCase().endsWith(".md")) {
    return null;
  }
  const normalized = candidate.replace(/\/+/g, "/");
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) return null;
  return normalized;
}

// POST { path?, id?, type, title, body, tags?, links?, status?, confidence? }
// → queue a wiki write for the bridge (writes the .md file + git commit on the mini).
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const title = (b.title || "").toString().trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  const rawType = (b.type || "note").toString().trim().toLowerCase();
  const type = rawType.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "note";
  const rawSlug = (b.id || title).toString().trim().toLowerCase();
  const slug = rawSlug.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "entry";
  const entryPath = normalizeWikiPath(b.path || `${type}s/${slug}.md`);
  if (!entryPath) return NextResponse.json({ error: "path must be a relative .md path inside the wiki" }, { status: 400 });
  const entry = {
    id: slug,
    path: entryPath,
    type,
    title,
    status: (b.status || "active").toString(),
    confidence: b.confidence ?? null,
    provenance: b.provenance ?? "dashboard",
    tags: Array.isArray(b.tags) ? b.tags : [],
    links: Array.isArray(b.links) ? b.links : [],
    body: (b.body || "").toString(),
  };
  const actor = await requestActor();
  const suppliedIdempotencyKey = b.idempotencyKey ?? req.headers.get("Idempotency-Key");
  if (!isValidIdempotencyKey(suppliedIdempotencyKey)) {
    return NextResponse.json({ error: "Idempotency-Key must be 1-200 characters" }, { status: 400 });
  }
  const idempotency = idempotencyFields("memory", suppliedIdempotencyKey, actor, entry);
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
      return NextResponse.json({ request: existing, entry, idempotent: true });
    }
  }
  let row;
  try {
    row = await prisma.agentRequest.create({
      data: {
        origin: "web",
        kind: "memory.write",
        title: `Memory: ${title}`.slice(0, 200),
        prompt: JSON.stringify(entry),
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
        return NextResponse.json({ request: existing, entry, idempotent: true });
      }
    }
    throw error;
  }
  return NextResponse.json({ request: row, entry });
}
