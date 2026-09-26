import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const GARDEN_KEY = "shared-garden";

type Plant = {
  id: string;
  name: string;
  emoji: string;
  location: "indoor" | "outdoor";
  waterSchedule: string;
  waterDays: number[];
  img?: string;
  tip?: string;
  addedBy?: string;
  addedAt?: string;
};

type GardenBlob = {
  version: number;
  lastUpdated: string;
  plants: Plant[];
};

function emptyGarden(): GardenBlob {
  return { version: 1, lastUpdated: new Date().toISOString(), plants: [] };
}

function normalizeGarden(value: unknown): GardenBlob {
  if (!value || typeof value !== "object") return emptyGarden();
  const candidate = value as Partial<GardenBlob>;
  const plants = Array.isArray(candidate.plants) ? candidate.plants : [];
  return {
    version: Number(candidate.version) || 1,
    lastUpdated: typeof candidate.lastUpdated === "string" ? candidate.lastUpdated : new Date().toISOString(),
    plants: plants.filter((plant): plant is Plant => {
      if (!plant || typeof plant !== "object") return false;
      const p = plant as Partial<Plant>;
      return typeof p.id === "string" && typeof p.name === "string" &&
        (p.location === "indoor" || p.location === "outdoor") && Array.isArray(p.waterDays);
    }),
  };
}

export async function GET() {
  try {
    const row = await prisma.dataStore.findUnique({ where: { key: GARDEN_KEY } });
    return NextResponse.json(normalizeGarden(row?.data));
  } catch (error) {
    console.error("Garden GET error:", error);
    return NextResponse.json({ error: "Failed to load garden" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = normalizeGarden(await req.json());
    body.lastUpdated = new Date().toISOString();
    await prisma.dataStore.upsert({
      where: { key: GARDEN_KEY },
      create: { key: GARDEN_KEY, data: body as Prisma.InputJsonValue },
      update: { data: body as Prisma.InputJsonValue },
    });
    return NextResponse.json(body);
  } catch (error) {
    console.error("Garden PUT error:", error);
    return NextResponse.json({ error: "Failed to update garden" }, { status: 500 });
  }
}
