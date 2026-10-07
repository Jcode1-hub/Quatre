import { NextResponse } from "next/server";
import { modelsForClient } from "@/lib/providers";

export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json({ models: modelsForClient(), demo: modelsForClient().every((model) => !model.available) }, { headers: { "Cache-Control": "no-store" } });
}
