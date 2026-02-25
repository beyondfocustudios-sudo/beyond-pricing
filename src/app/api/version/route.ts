import { NextResponse } from "next/server";
import { getBuildStamp } from "@/lib/build-stamp";

export const dynamic = "force-dynamic";

export async function GET() {
  const stamp = getBuildStamp();

  return NextResponse.json(
    {
      env: stamp.env,
      branch: stamp.ref,
      sha: stamp.sha,
      buildTime: stamp.builtAt,
      deploymentUrl: stamp.deploymentUrl,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
