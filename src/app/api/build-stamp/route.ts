import { NextResponse } from "next/server";
import { getBuildStampInfo } from "@/lib/build-stamp";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const info = getBuildStampInfo();
  return NextResponse.json(
    {
      ok: true,
      build: info,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
