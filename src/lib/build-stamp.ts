export type BuildStamp = {
  env: string;
  ref: string;
  sha: string;
  deploymentUrl: string;
  builtAt: string;
};

const BUILT_AT = new Date().toISOString();

export function getBuildStamp(): BuildStamp {
  const env = process.env.VERCEL_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "local");
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? "local";
  const fullSha = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
  const sha = fullSha === "local" ? "local" : fullSha.slice(0, 7);
  const deploymentUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "local";

  return {
    env,
    ref,
    sha,
    deploymentUrl,
    builtAt: BUILT_AT,
  };
}

