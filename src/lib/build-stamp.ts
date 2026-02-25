export type BuildStamp = {
  env: string | null;
  ref: string | null;
  sha: string | null;
  builtAt: string | null;
};

export function getBuildStamp(): BuildStamp {
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null;
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  const fullSha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? null;
  const sha = fullSha ? fullSha.slice(0, 7) : null;
  const builtAt = process.env.NEXT_PUBLIC_BUILD_TIME ?? null;

  return {
    env,
    ref,
    sha,
    builtAt,
  };
}
