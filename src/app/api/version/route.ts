import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? null;
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null;
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? null;

  return NextResponse.json(
    {
      sha,
      branch,
      env,
      buildTime,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
