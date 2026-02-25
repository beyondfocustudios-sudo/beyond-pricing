import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const payload = {
    sha:
      process.env.VERCEL_GIT_COMMIT_SHA
      || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
      || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
    buildTime:
      process.env.NEXT_PUBLIC_BUILD_TIME
      || process.env.VERCEL_GIT_COMMIT_TIMESTAMP
      || null,
    deploymentUrl:
      process.env.VERCEL_URL
      || process.env.NEXT_PUBLIC_VERCEL_URL
      || null,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

