import { NextResponse } from "next/server";
import { getBuildStamp } from "@/lib/build-stamp";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getBuildStamp());
}

