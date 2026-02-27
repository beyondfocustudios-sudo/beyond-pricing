import { NextResponse } from "next/server";
  export const dynamic = "force-dynamic";
  export const revalidate = 0;  export async function GET() {
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? new Date().toISOString();
  const payload = {
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "unknown",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_GIT_BRANCH ?? "unknown",
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    buildTime,
    deploymentUrl: process.env.VERCESL_URL ? `https://${process.env.VERCEL_URL}` : null,
  };  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}